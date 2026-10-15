import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { MediaRequest } from '@server/entity/MediaRequest';
import { getSettings } from '@server/lib/settings';
import { Not } from 'typeorm';

/**
 * Storage shown to end users is inflated by this factor to leave headroom.
 * ponytail: single knob; adjust here if the pool changes.
 */
export const STORAGE_BIAS = 1.25;

export interface UserStorage {
  size: number;
  biasedSize: number;
}

const CACHE_TTL = 5 * 60 * 1000;
let cache: { expires: number; data: Map<number, number> } | null = null;
const cacheEnabled = process.env.NODE_ENV !== 'test';

async function buildLibrarySizeMaps(): Promise<{
  radarr: Map<string, number>;
  sonarr: Map<string, number>;
}> {
  const settings = getSettings();
  const radarr = new Map<string, number>();
  const sonarr = new Map<string, number>();

  await Promise.all([
    ...settings.radarr.map(async (server) => {
      try {
        const api = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });
        for (const movie of await api.getMovies()) {
          const size = movie.movieFile?.size ?? 0;
          if (size > 0) {
            radarr.set(`${server.id}:${movie.tmdbId}`, size);
          }
        }
      } catch {
        // Unreachable/unconfigured servers contribute nothing.
      }
    }),
    ...settings.sonarr.map(async (server) => {
      try {
        const api = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });
        for (const show of await api.getSeries()) {
          const size = show.statistics?.sizeOnDisk ?? 0;
          if (size > 0) {
            sonarr.set(`${server.id}:${show.tvdbId}`, size);
          }
        }
      } catch {
        // Unreachable/unconfigured servers contribute nothing.
      }
    }),
  ]);

  return { radarr, sonarr };
}

async function computeUsage(): Promise<Map<number, number>> {
  const requestRepository = getRepository(MediaRequest);
  const requests = await requestRepository.find({
    where: { status: Not(MediaRequestStatus.DECLINED) },
  });

  const { radarr, sonarr } = await buildLibrarySizeMaps();
  const usage = new Map<number, number>();
  const counted = new Set<string>();

  for (const request of requests) {
    const media = request.media;
    if (!media) {
      continue;
    }

    const serverId = request.is4k ? media.serviceId4k : media.serviceId;
    if (serverId == null || serverId < 0) {
      continue;
    }

    const size =
      request.type === MediaType.MOVIE
        ? radarr.get(`${serverId}:${media.tmdbId}`)
        : media.tvdbId != null
          ? sonarr.get(`${serverId}:${media.tvdbId}`)
          : undefined;

    if (!size || size <= 0) {
      continue;
    }

    // A media item requested twice (e.g. re-request) should only count once.
    const dedupe = `${request.requestedBy.id}:${media.id}:${request.is4k}`;
    if (counted.has(dedupe)) {
      continue;
    }
    counted.add(dedupe);

    usage.set(request.requestedBy.id, (usage.get(request.requestedBy.id) ?? 0) + size);
  }

  return usage;
}

function toStorage(usage: Map<number, number>): Map<number, UserStorage> {
  const result = new Map<number, UserStorage>();
  for (const [userId, size] of usage) {
    result.set(userId, {
      size,
      biasedSize: Math.round(size * STORAGE_BIAS),
    });
  }
  return result;
}

export async function getUserStorage(): Promise<Map<number, UserStorage>> {
  if (cacheEnabled && cache && cache.expires > Date.now()) {
    return toStorage(cache.data);
  }

  const usage = await computeUsage();

  if (cacheEnabled) {
    cache = { expires: Date.now() + CACHE_TTL, data: usage };
  }

  return toStorage(usage);
}

import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import TautulliAPI from '@server/api/tautulli';
import TheMovieDb from '@server/api/themoviedb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import Season from '@server/entity/Season';
import { User } from '@server/entity/User';
import type {
  MediaResultsResponse,
  MediaWatchDataResponse,
} from '@server/interfaces/api/mediaInterfaces';
import { Permission } from '@server/lib/permissions';
import { getSettings, type DVRSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';
import type { FindOneOptions } from 'typeorm';
import { EntityNotFoundError, In, IsNull, Not } from 'typeorm';

const mediaRoutes = Router();

mediaRoutes.get('/', async (req, res, next) => {
  const mediaRepository = getRepository(Media);

  const pageSize = req.query.take ? Number(req.query.take) : 20;
  const skip = req.query.skip ? Number(req.query.skip) : 0;

  let statusFilter = undefined;

  switch (req.query.filter) {
    case 'available':
      statusFilter = MediaStatus.AVAILABLE;
      break;
    case 'partial':
      statusFilter = MediaStatus.PARTIALLY_AVAILABLE;
      break;
    case 'allavailable':
      statusFilter = In([
        MediaStatus.AVAILABLE,
        MediaStatus.PARTIALLY_AVAILABLE,
      ]);
      break;
    case 'processing':
      statusFilter = MediaStatus.PROCESSING;
      break;
    case 'pending':
      statusFilter = MediaStatus.PENDING;
      break;
  }

  let sortFilter: FindOneOptions<Media>['order'] = {
    id: 'DESC',
  };

  switch (req.query.sort) {
    case 'modified':
      sortFilter = {
        updatedAt: 'DESC',
      };
      break;
    case 'mediaAdded':
      sortFilter = {
        mediaAddedAt: 'DESC',
      };
  }

  let whereClause: FindOneOptions<Media>['where'];
  if (statusFilter || req.query.sort === 'mediaAdded') {
    whereClause = {};
    if (statusFilter) whereClause.status = statusFilter;
    if (req.query.sort === 'mediaAdded')
      whereClause.mediaAddedAt = Not(IsNull());
  }

  try {
    const [media, mediaCount] = await mediaRepository.findAndCount({
      order: sortFilter,
      where: whereClause,
      take: pageSize,
      skip,
    });
    return res.status(200).json({
      pageInfo: {
        pages: Math.ceil(mediaCount / pageSize),
        pageSize,
        results: mediaCount,
        page: Math.ceil(skip / pageSize) + 1,
      },
      results: media,
    } as MediaResultsResponse);
  } catch (e) {
    next({ status: 500, message: e.message });
  }
});

mediaRoutes.post<
  {
    id: string;
    status: 'available' | 'partial' | 'processing' | 'pending' | 'unknown';
  },
  Media
>(
  '/:id/:status',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (req, res, next) => {
    const mediaRepository = getRepository(Media);
    const seasonRepository = getRepository(Season);

    const media = await mediaRepository.findOne({
      where: { id: Number(req.params.id) },
    });

    if (!media) {
      return next({ status: 404, message: 'Media does not exist.' });
    }

    const is4k = String(req.body.is4k) === 'true';

    switch (req.params.status) {
      case 'available':
        media[is4k ? 'status4k' : 'status'] = MediaStatus.AVAILABLE;

        if (media.mediaType === MediaType.TV) {
          const expectedSeasons = req.body.seasons ?? [];

          for (const expectedSeason of expectedSeasons) {
            let season = media.seasons.find(
              (s) => s.seasonNumber === expectedSeason?.seasonNumber
            );

            if (!season) {
              // Create the season if it doesn't exist
              season = seasonRepository.create({
                seasonNumber: expectedSeason?.seasonNumber,
              });
              media.seasons.push(season);
            }

            season[is4k ? 'status4k' : 'status'] = MediaStatus.AVAILABLE;
          }
        }
        break;
      case 'partial':
        if (media.mediaType === MediaType.MOVIE) {
          return next({
            status: 400,
            message: 'Only series can be set to be partially available',
          });
        }
        media[is4k ? 'status4k' : 'status'] = MediaStatus.PARTIALLY_AVAILABLE;
        break;
      case 'processing':
        media[is4k ? 'status4k' : 'status'] = MediaStatus.PROCESSING;
        break;
      case 'pending':
        media[is4k ? 'status4k' : 'status'] = MediaStatus.PENDING;
        break;
      case 'unknown':
        media[is4k ? 'status4k' : 'status'] = MediaStatus.UNKNOWN;
    }

    await mediaRepository.save(media);

    return res.status(200).json(media);
  }
);

mediaRoutes.delete(
  '/:id',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (req, res, next) => {
    try {
      const mediaRepository = getRepository(Media);

      const media = await mediaRepository.findOneOrFail({
        where: { id: Number(req.params.id) },
      });

      if (media.status === MediaStatus.BLOCKLISTED) {
        media.resetServiceData();
        await mediaRepository.save(media);
      } else {
        await mediaRepository.remove(media);
      }

      return res.status(204).send();
    } catch (e) {
      if (e instanceof EntityNotFoundError) {
        return res.status(204).send();
      }
      logger.error('Something went wrong deleting media', {
        label: 'Media',
        mediaId: req.params.id,
        message: e.message,
      });
      next({ status: 500, message: 'Failed to delete media' });
    }
  }
);

mediaRoutes.delete(
  '/:id/file',
  isAuthenticated(
    [Permission.MANAGE_REQUESTS, Permission.MANAGE_OWN_REQUESTS],
    {
      type: 'or',
    }
  ),
  async (req, res, next) => {
    try {
      const settings = getSettings();
      const mediaRepository = getRepository(Media);
      const media = await mediaRepository.findOneOrFail({
        where: { id: Number(req.params.id) },
        relations: { requests: { requestedBy: true } },
      });

      const is4k = String(req.query.is4k) === 'true';
      const isMovie = media.mediaType === MediaType.MOVIE;

      const canManageMediaRequesters = (media.requests ?? []).some(
        (request) =>
          request.is4k === is4k &&
          request.status !== MediaRequestStatus.DECLINED &&
          (req.user?.canManageRequestsOf(request.requestedBy?.id ?? -1) ??
            false)
      );

      if (
        !req.user?.hasPermission(Permission.MANAGE_REQUESTS) &&
        !(
          req.user?.hasPermission(Permission.MANAGE_OWN_REQUESTS) &&
          media.isOwnedBy(req.user.id, is4k)
        ) &&
        !canManageMediaRequesters
      ) {
        return next({
          status: 403,
          message: 'You do not have permission to delete this media.',
        });
      }

      let serviceSettings;
      if (isMovie) {
        serviceSettings = settings.radarr.find(
          (radarr) => radarr.isDefault && radarr.is4k === is4k
        );
      } else {
        serviceSettings = settings.sonarr.find(
          (sonarr) => sonarr.isDefault && sonarr.is4k === is4k
        );
      }

      const specificServiceId = is4k ? media.serviceId4k : media.serviceId;
      if (
        specificServiceId &&
        specificServiceId >= 0 &&
        serviceSettings?.id !== specificServiceId
      ) {
        if (isMovie) {
          serviceSettings = settings.radarr.find(
            (radarr) => radarr.id === specificServiceId
          );
        } else {
          serviceSettings = settings.sonarr.find(
            (sonarr) => sonarr.id === specificServiceId
          );
        }
      }

      if (!serviceSettings) {
        const arrName = `${is4k ? '4K ' : ''}${isMovie ? 'Radarr' : 'Sonarr'}`;
        logger.info(
          `There is no default ${arrName} server configured. Did you set any of your ${arrName} servers as default?`,
          {
            label: 'Media Request',
            mediaId: media.id,
          }
        );
        return next({
          status: 409,
          message: `No ${arrName} server configured to delete media files`,
        });
      }

      let service;
      if (isMovie) {
        service = new RadarrAPI({
          apiKey: serviceSettings?.apiKey,
          url: RadarrAPI.buildUrl(serviceSettings, '/api/v3'),
        });
      } else {
        service = new SonarrAPI({
          apiKey: serviceSettings?.apiKey,
          url: SonarrAPI.buildUrl(serviceSettings, '/api/v3'),
        });
      }

      if (isMovie) {
        await (service as RadarrAPI).removeMovie(media.tmdbId);
      } else {
        const tmdb = new TheMovieDb();
        const series = await tmdb.getTvShow({ tvId: media.tmdbId });
        const tvdbId = series.external_ids.tvdb_id ?? media.tvdbId;
        if (!tvdbId) {
          throw new Error('TVDB ID not found');
        }
        await (service as SonarrAPI).removeSeries(tvdbId);

        for (const season of media.seasons) {
          season[is4k ? 'status4k' : 'status'] = MediaStatus.DELETED;
        }
      }

      media[is4k ? 'status4k' : 'status'] = MediaStatus.DELETED;
      media.resetServiceData(is4k);
      await mediaRepository.save(media);

      return res.status(204).send();
    } catch (e) {
      if (e instanceof EntityNotFoundError) {
        return next({ status: 404, message: 'Media not found' });
      }
      logger.error('Something went wrong deleting media file', {
        label: 'Media',
        mediaId: req.params.id,
        message: e.message,
      });
      next({ status: 500, message: 'Failed to delete media file' });
    }
  }
);

const sizeCache = new Map<
  string,
  {
    expires: number;
    size: number | null;
    seasons: { seasonNumber: number; size: number }[] | null;
  }
>();
const SIZE_CACHE_TTL = 5 * 60 * 1000;
// Disabled under the test runner, where media IDs repeat between tests.
const sizeCacheEnabled = process.env.NODE_ENV !== 'test';

mediaRoutes.get('/:id/size', isAuthenticated(), async (req, res, next) => {
  try {
    const is4k = String(req.query.is4k) === 'true';
    const cacheKey = `${req.params.id}:${is4k}`;
    const cached = sizeCacheEnabled ? sizeCache.get(cacheKey) : undefined;
    if (cached && cached.expires > Date.now()) {
      return res.status(200).json({
        size: cached.size,
        seasons: cached.seasons,
      });
    }

    const settings = getSettings();
    const mediaRepository = getRepository(Media);
    const media = await mediaRepository.findOneOrFail({
      where: { id: Number(req.params.id) },
    });

    const isMovie = media.mediaType === MediaType.MOVIE;
    let serviceSettings: DVRSettings | undefined;
    if (isMovie) {
      serviceSettings = settings.radarr.find(
        (radarr) => radarr.isDefault && radarr.is4k === is4k
      );
    } else {
      serviceSettings = settings.sonarr.find(
        (sonarr) => sonarr.isDefault && sonarr.is4k === is4k
      );
    }

    const specificServiceId = is4k ? media.serviceId4k : media.serviceId;
    if (
      specificServiceId != null &&
      specificServiceId >= 0 &&
      serviceSettings?.id !== specificServiceId
    ) {
      serviceSettings = isMovie
        ? settings.radarr.find((radarr) => radarr.id === specificServiceId)
        : settings.sonarr.find((sonarr) => sonarr.id === specificServiceId);
    }

    let size: number | null = null;
    let seasons: { seasonNumber: number; size: number }[] | null = null;
    if (serviceSettings) {
      if (isMovie) {
        const radarr = new RadarrAPI({
          apiKey: serviceSettings.apiKey,
          url: RadarrAPI.buildUrl(serviceSettings, '/api/v3'),
        });
        const movies = await radarr.getLibraryMoviesByTmdbId(media.tmdbId);
        size = movies[0]?.movieFile?.size ?? null;
      } else if (media.tvdbId) {
        const sonarr = new SonarrAPI({
          apiKey: serviceSettings.apiKey,
          url: SonarrAPI.buildUrl(serviceSettings, '/api/v3'),
        });
        const series = await sonarr.getLibrarySeriesByTvdbId(media.tvdbId);
        size = series[0]?.statistics?.sizeOnDisk ?? null;
        seasons =
          series[0]?.seasons
            ?.filter((season) => season.seasonNumber > 0)
            .map((season) => ({
              seasonNumber: season.seasonNumber,
              size: season.statistics?.sizeOnDisk ?? 0,
            })) ?? null;
      }
    }

    if (sizeCacheEnabled) {
      sizeCache.set(cacheKey, {
        expires: Date.now() + SIZE_CACHE_TTL,
        size,
        seasons,
      });
    }

    return res.status(200).json({ size, seasons });
  } catch (e) {
    if (e instanceof EntityNotFoundError) {
      return next({ status: 404, message: 'Media not found.' });
    }
    logger.error('Something went wrong retrieving media file size', {
      label: 'Media',
      mediaId: req.params.id,
      message: e.message,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve media file size.',
    });
  }
});

mediaRoutes.delete(
  '/:id/season/:seasonNumber',
  isAuthenticated(),
  async (req, res, next) => {
    try {
      const is4k = String(req.query.is4k) === 'true';
      const seasonNumber = Number(req.params.seasonNumber);
      const mediaRepository = getRepository(Media);
      const seasonRepository = getRepository(Season);

      const media = await mediaRepository.findOneOrFail({
        where: { id: Number(req.params.id) },
        relations: {
          requests: { requestedBy: true, seasons: true },
          seasons: true,
        },
      });

      if (media.mediaType !== MediaType.TV) {
        return next({ status: 400, message: 'Media is not a series.' });
      }

      const canManageSeasonRequesters = (media.requests ?? []).some(
        (request) =>
          request.is4k === is4k &&
          request.status !== MediaRequestStatus.DECLINED &&
          (request.seasons ?? []).some(
            (season) => season.seasonNumber === seasonNumber
          ) &&
          (req.user?.canManageRequestsOf(request.requestedBy?.id ?? -1) ??
            false)
      );

      if (
        !req.user?.hasPermission(Permission.MANAGE_REQUESTS) &&
        !(
          req.user?.hasPermission(Permission.MANAGE_OWN_REQUESTS) &&
          media.isSeasonOwnedBy(req.user.id, is4k, seasonNumber)
        ) &&
        !canManageSeasonRequesters
      ) {
        return next({
          status: 403,
          message: 'You do not have permission to delete this season.',
        });
      }

      const settings = getSettings();
      let serviceSettings: DVRSettings | undefined = settings.sonarr.find(
        (sonarr) => sonarr.isDefault && sonarr.is4k === is4k
      );
      const specificServiceId = is4k ? media.serviceId4k : media.serviceId;
      if (
        specificServiceId != null &&
        specificServiceId >= 0 &&
        serviceSettings?.id !== specificServiceId
      ) {
        serviceSettings = settings.sonarr.find(
          (sonarr) => sonarr.id === specificServiceId
        );
      }

      if (!serviceSettings) {
        return next({
          status: 409,
          message: 'No Sonarr server configured to delete season files',
        });
      }

      if (media.tvdbId) {
        const sonarr = new SonarrAPI({
          apiKey: serviceSettings.apiKey,
          url: SonarrAPI.buildUrl(serviceSettings, '/api/v3'),
        });

        const series = (await sonarr.getLibrarySeriesByTvdbId(media.tvdbId))[0];
        const seriesId = series?.id;
        if (seriesId != null) {
          const seasonEpisodes = (await sonarr.getEpisodes(seriesId)).filter(
            (episode) => episode.seasonNumber === seasonNumber
          );
          const episodeFileIds = seasonEpisodes
            .map((episode) => episode.episodeFileId)
            .filter((id) => id > 0);

          if (episodeFileIds.length > 0) {
            await sonarr.deleteEpisodeFiles(episodeFileIds);
          }

          // Unmonitor the season so Sonarr does not immediately re-download it.
          await sonarr.setEpisodesMonitored(
            seasonEpisodes.map((episode) => episode.id),
            false
          );
        }
      }

      const statusField = is4k ? 'status4k' : 'status';
      let season = media.seasons?.find(
        (item) => item.seasonNumber === seasonNumber
      );
      if (!season) {
        season = seasonRepository.create({ seasonNumber });
        media.seasons.push(season);
      }
      season[statusField] = MediaStatus.DELETED;

      const seasonStatuses = media.seasons.map((item) => item[statusField]);
      if (seasonStatuses.every((status) => status === MediaStatus.DELETED)) {
        media[statusField] = MediaStatus.DELETED;
      } else if (
        seasonStatuses.some((status) => status === MediaStatus.DELETED)
      ) {
        media[statusField] = MediaStatus.PARTIALLY_AVAILABLE;
      }

      await mediaRepository.save(media);

      return res.status(204).send();
    } catch (e) {
      if (e instanceof EntityNotFoundError) {
        return next({ status: 404, message: 'Media not found.' });
      }
      logger.error('Something went wrong deleting season files', {
        label: 'Media',
        mediaId: req.params.id,
        seasonNumber: req.params.seasonNumber,
        message: e.message,
      });
      return next({
        status: 500,
        message: 'Unable to delete season files.',
      });
    }
  }
);

mediaRoutes.get<{ id: string }, MediaWatchDataResponse>(
  '/:id/watch_data',
  isAuthenticated(Permission.ADMIN),
  async (req, res, next) => {
    const settings = getSettings().tautulli;

    if (!settings.hostname || !settings.port || !settings.apiKey) {
      return next({
        status: 404,
        message: 'Tautulli API not configured.',
      });
    }

    const media = await getRepository(Media).findOne({
      where: { id: Number(req.params.id) },
    });

    if (!media) {
      return next({ status: 404, message: 'Media does not exist.' });
    }

    try {
      const tautulli = new TautulliAPI(settings);
      const userRepository = getRepository(User);

      const response: MediaWatchDataResponse = {};

      if (media.ratingKey) {
        const watchStats = await tautulli.getMediaWatchStats(media.ratingKey);
        const watchUsers = await tautulli.getMediaWatchUsers(media.ratingKey);
        const plexIds = watchUsers.map((u) => u.user_id);
        if (!plexIds.length) plexIds.push(-1);

        const users = await userRepository
          .createQueryBuilder('user')
          .where('user.plexId IN (:...plexIds)', { plexIds })
          .getMany();

        const playCount =
          watchStats.find((i) => i.query_days == 0)?.total_plays ?? 0;

        const playCount7Days =
          watchStats.find((i) => i.query_days == 7)?.total_plays ?? 0;

        const playCount30Days =
          watchStats.find((i) => i.query_days == 30)?.total_plays ?? 0;

        response.data = {
          users: users,
          playCount,
          playCount7Days,
          playCount30Days,
        };
      }

      if (media.ratingKey4k) {
        const watchStats4k = await tautulli.getMediaWatchStats(
          media.ratingKey4k
        );
        const watchUsers4k = await tautulli.getMediaWatchUsers(
          media.ratingKey4k
        );
        const plexIds4k = watchUsers4k.map((u) => u.user_id);
        if (!plexIds4k.length) plexIds4k.push(-1);

        const users = await userRepository
          .createQueryBuilder('user')
          .where('user.plexId IN (:...plexIds)', { plexIds: plexIds4k })
          .getMany();

        const playCount =
          watchStats4k.find((i) => i.query_days == 0)?.total_plays ?? 0;

        const playCount7Days =
          watchStats4k.find((i) => i.query_days == 7)?.total_plays ?? 0;

        const playCount30Days =
          watchStats4k.find((i) => i.query_days == 30)?.total_plays ?? 0;

        response.data4k = {
          users,
          playCount,
          playCount7Days,
          playCount30Days,
        };
      }

      return res.status(200).json(response);
    } catch (e) {
      logger.error('Something went wrong fetching media watch data', {
        label: 'API',
        errorMessage: e.message,
        mediaId: req.params.id,
      });
      next({ status: 500, message: 'Failed to fetch watch data.' });
    }
  }
);

export default mediaRoutes;

import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import RadarrAPI from '@server/api/servarr/radarr';
import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import type { RadarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import mediaRoutes from './media';

// removeMovie is an instance arrow property, so it cannot be mocked directly.
// Stubbing the lookup it calls lets removeMovie run and lets us count invocations
// without touching the network (an id of 0 short-circuits before the HTTP call).
const getMovieByTmdbIdMock = mock.method(
  RadarrAPI.prototype,
  'getMovieByTmdbId',
  async () => ({ id: 0, title: '' })
).mock;

// Saving a request triggers the subscribers, which look up TMDB metadata.
Object.defineProperty(TheMovieDb.prototype, 'getMovie', {
  get() {
    return async ({ movieId }: { movieId: number }) =>
      ({ id: movieId, external_ids: {} }) as unknown as TmdbMovieDetails;
  },
  set() {},
  configurable: true,
});

Object.defineProperty(TheMovieDb.prototype, 'getTvShow', {
  get() {
    return async ({ tvId }: { tvId: number }) =>
      ({ id: tvId, external_ids: {} }) as unknown as TmdbTvDetails;
  },
  set() {},
  configurable: true,
});

mock.method(MediaRequest, 'sendNotification', async () => undefined);

function configureRadarr(): void {
  const settings = getSettings();
  settings.radarr = [
    {
      id: 0,
      name: 'Radarr',
      hostname: 'localhost',
      port: 7878,
      apiKey: 'test-key',
      baseUrl: '',
      useSsl: false,
      activeProfileId: 1,
      activeDirectory: '/movies',
      is4k: false,
      minimumAvailability: 'released',
      tags: [],
      isDefault: true,
      syncEnabled: true,
      preventSearch: false,
      externalUrl: '',
    },
  ] as unknown as RadarrSettings[];
}

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/media', mediaRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(() => {
  app = createApp();
});

beforeEach(() => {
  getMovieByTmdbIdMock.resetCalls();
});

setupTestDb();

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

async function setPermissions(email: string, permissions: number) {
  const userRepo = getRepository(User);
  const user = await userRepo.findOneOrFail({ where: { email } });
  user.permissions = permissions;
  await userRepo.save(user);
}

async function seedMediaRequest(ownerEmail: string, media?: Media) {
  const userRepo = getRepository(User);
  const mediaRepo = getRepository(Media);
  const requestRepo = getRepository(MediaRequest);

  const owner = await userRepo.findOneOrFail({ where: { email: ownerEmail } });

  const targetMedia =
    media ??
    (await mediaRepo.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 12345,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    ));

  const mediaRequest = await requestRepo.save(
    new MediaRequest({
      type: MediaType.MOVIE,
      status: MediaRequestStatus.APPROVED,
      media: targetMedia,
      requestedBy: owner,
      is4k: false,
    })
  );

  return { media: targetMedia, mediaRequest };
}

describe('DELETE /media/:id/file', () => {
  it('allows the sole requester with MANAGE_OWN_REQUESTS to delete the file', async () => {
    configureRadarr();
    await setPermissions('demo@seerr.dev', Permission.MANAGE_OWN_REQUESTS);
    const { media } = await seedMediaRequest('demo@seerr.dev');

    const agent = await loginAs('demo@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?is4k=false`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(getMovieByTmdbIdMock.callCount(), 1);
  });

  it('forbids deleting the file when another user has an active request', async () => {
    configureRadarr();
    await setPermissions('demo@seerr.dev', Permission.MANAGE_OWN_REQUESTS);
    const { media } = await seedMediaRequest('demo@seerr.dev');
    await seedMediaRequest('admin@seerr.dev', media);

    const agent = await loginAs('demo@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?is4k=false`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(getMovieByTmdbIdMock.callCount(), 0);
  });

  it('forbids a MANAGE_OWN_REQUESTS user from deleting another user media', async () => {
    configureRadarr();
    await setPermissions('demo@seerr.dev', Permission.MANAGE_OWN_REQUESTS);
    const { media } = await seedMediaRequest('admin@seerr.dev');

    const agent = await loginAs('demo@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?is4k=false`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(getMovieByTmdbIdMock.callCount(), 0);
  });

  it('allows an admin to delete any file', async () => {
    configureRadarr();
    const { media } = await seedMediaRequest('demo@seerr.dev');

    const agent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await agent.delete(`/media/${media.id}/file?is4k=false`);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(getMovieByTmdbIdMock.callCount(), 1);
  });
});

describe('GET /media/:id/size', () => {
  it('returns a null size when no Radarr server is configured', async () => {
    getSettings().radarr = [];
    const { media } = await seedMediaRequest('demo@seerr.dev');

    const agent = await loginAs('demo@seerr.dev', 'test1234');
    const res = await agent.get(`/media/${media.id}/size?is4k=false`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.size, null);
  });
});

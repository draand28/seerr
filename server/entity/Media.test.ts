import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaRequestStatus } from '@server/constants/media';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';

const request = (
  userId: number,
  is4k: boolean,
  status = MediaRequestStatus.APPROVED
) =>
  new MediaRequest({
    is4k,
    status,
    requestedBy: new User({ id: userId }),
  });

describe('Media.isOwnedBy', () => {
  it('is true when the user is the only non-declined requester', () => {
    const media = new Media({ requests: [request(1, false)] });

    assert.strictEqual(media.isOwnedBy(1, false), true);
    assert.strictEqual(media.isOwnedBy(2, false), false);
  });

  it('ignores requests for the other resolution', () => {
    const media = new Media({ requests: [request(1, true)] });

    assert.strictEqual(media.isOwnedBy(1, false), false);
    assert.strictEqual(media.isOwnedBy(1, true), true);
  });

  it('is false when another user still has an active request', () => {
    const media = new Media({
      requests: [request(1, false), request(2, false)],
    });

    assert.strictEqual(media.isOwnedBy(1, false), false);
  });

  it('ignores declined requests from other users', () => {
    const media = new Media({
      requests: [
        request(1, false),
        request(2, false, MediaRequestStatus.DECLINED),
      ],
    });

    assert.strictEqual(media.isOwnedBy(1, false), true);
  });

  it('is false when there are no requests', () => {
    const media = new Media({ requests: [] });

    assert.strictEqual(media.isOwnedBy(1, false), false);
  });
});

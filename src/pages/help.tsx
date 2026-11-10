import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Help', {
  title: 'Help',
  intro:
    'A short guide to the features this server adds on top of standard Seerr: managing your own requests, deleting files, storage limits, the anti-hit-and-run hold, and HDR/SDR preferences.',
  yourRequestsTitle: 'Managing your own requests',
  yourRequestsBody:
    'Your profile can be given the "Manage Own Requests" permission. With it you see and delete the requests you made, without waiting for an admin.\n\n- Open Requests from the menu, or your profile page.\n- "Delete Request" removes the request record only.\n- "Delete Request & Files" removes the request and the downloaded file.',
  deletingFilesTitle: 'Deleting files and seasons',
  deletingFilesBody:
    'When a request has a downloaded file, the request card shows "Delete Request & Files".\n\n- Movies: the movie file is deleted from Radarr.\n- Series: only the seasons in that request are deleted, never the whole series.\n- Per-season sizes are shown next to each season so you can see what a season costs in disk space.',
  holdTitle: 'Deletion hold for new media',
  holdBody:
    'To prevent hit-and-run deletes, media cannot be deleted right after it is downloaded.\n\n- A movie file or season can be deleted 7 days after it became available.\n- Trying earlier returns a message with the exact unlock date.\n- Admins and users with "Manage Requests" bypass the hold.',
  quotaTitle: 'Storage quota',
  quotaBody:
    'Every user has a storage quota, 200 GB by default. It limits new downloads, not existing ones.\n\n- Once your downloaded media reaches the quota, new requests are rejected with a "Storage quota exceeded" message.\n- Nothing you already have is deleted automatically. You keep the media until you delete it yourself.\n- 0 means unlimited.\n- Admins set the quota per user on the user Permissions page, which also shows current usage.',
  hdrTitle: 'HDR or SDR preference',
  hdrBody:
    'You can pick which video version you prefer for your requests.\n\n- Go to Profile, Settings, General, "Preferred Video Version" and choose No preference, Prefer HDR, or Prefer SDR.\n- An admin maps an HDR profile and an SDR profile to each Radarr and Sonarr server under Settings, Services.\n- Your preference then selects the matching quality profile when the movie or series is added.\n- A quality profile you pick manually in an advanced request always wins, and servers without a mapping keep using their default profile.',
  delegationTitle: 'Managing other users\' requests',
  delegationBody:
    'Admins can let a user manage the requests of other users.\n\n- On the user Permissions page, set "Manage requests of" and pick the users.\n- That user can then view and delete requests belonging to the selected users.\n- Admins can always delete any request from the request list.',
  adminTitle: 'Admin quick reference',
  adminBody:
    '- User Permissions page: permissions, "Manage requests of", storage quota and current usage.\n- Settings, Services: HDR and SDR quality profiles per Radarr and Sonarr server.\n- Request list: delete any user\'s request.\n- The version badge in the sidebar shows the build commit and build date.',
});

const sectionKeys = [
  ['yourRequestsTitle', 'yourRequestsBody'],
  ['deletingFilesTitle', 'deletingFilesBody'],
  ['holdTitle', 'holdBody'],
  ['quotaTitle', 'quotaBody'],
  ['hdrTitle', 'hdrBody'],
  ['delegationTitle', 'delegationBody'],
  ['adminTitle', 'adminBody'],
] as const;

const HelpPage: NextPage = () => {
  const intl = useIntl();

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title={intl.formatMessage(messages.title)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          {intl.formatMessage(messages.title)}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          {intl.formatMessage(messages.intro)}
        </p>
      </div>
      {sectionKeys.map(([titleKey, bodyKey]) => (
        <section
          key={titleKey}
          className="mb-4 rounded-lg border border-gray-700 bg-gray-800 p-6"
        >
          <h2 className="mb-3 text-lg font-bold text-white">
            {intl.formatMessage(messages[titleKey])}
          </h2>
          <p className="whitespace-pre-line text-sm leading-6 text-gray-300">
            {intl.formatMessage(messages[bodyKey])}
          </p>
        </section>
      ))}
    </div>
  );
};

export default HelpPage;

import { CodeBracketIcon } from '@heroicons/react/24/outline';
import type { StatusResponse } from '@server/interfaces/api/settingsInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface VersionStatusProps {
  onClick?: () => void;
}

const VersionStatus = ({ onClick }: VersionStatusProps) => {
  const intl = useIntl();
  const { data } = useSWR<StatusResponse>(
    '/api/v1/status?checkUpdateAvailable=false',
    {
      refreshInterval: 60 * 1000,
    }
  );

  if (!data) {
    return null;
  }

  const builtAt = data.buildDate ? new Date(data.buildDate) : undefined;
  const buildDate =
    builtAt && !Number.isNaN(builtAt.getTime())
      ? `${intl.formatDate(builtAt, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })} ${intl.formatTime(builtAt, {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : data.version;

  return (
    <Link
      href="/settings/about"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onClick) {
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      className="mx-2 flex items-center rounded-lg bg-gray-900 p-2 text-xs text-gray-300 ring-1 ring-gray-700 transition duration-300 hover:bg-gray-800"
    >
      <CodeBracketIcon className="h-6 w-6 flex-shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col truncate px-2 last:pr-0">
        <span className="truncate font-bold">
          {data.commitTag === 'local' ? 'local build' : data.commitTag}
        </span>
        <span className="truncate">{buildDate}</span>
      </div>
    </Link>
  );
};

export default VersionStatus;

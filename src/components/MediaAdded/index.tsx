import useMediaSize from '@app/hooks/useMediaSize';
import defineMessages from '@app/utils/defineMessages';
import type { ReactNode } from 'react';
import { FormattedRelativeTime, useIntl } from 'react-intl';

const messages = defineMessages('components.MediaAdded', {
  downloaded: 'Downloaded',
});

interface MediaAddedProps {
  mediaId?: number;
  is4k?: boolean;
  label?: ReactNode;
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
}

/**
 * Shows how long ago the newest file for this title was downloaded, so users
 * can tell when it is safe to delete and stop seeding.
 */
const MediaAdded = ({
  mediaId,
  is4k = false,
  label,
  className,
  containerClassName,
  labelClassName,
}: MediaAddedProps) => {
  const intl = useIntl();
  const data = useMediaSize(mediaId, is4k);

  if (!data?.dateAdded) {
    return null;
  }

  return (
    <div className={containerClassName}>
      <span className={labelClassName}>
        {label ?? intl.formatMessage(messages.downloaded)}
      </span>
      <span className={className}>
        <FormattedRelativeTime
          value={(new Date(data.dateAdded).getTime() - Date.now()) / 1000}
          numeric="auto"
          updateIntervalInSeconds={3600}
        />
      </span>
    </div>
  );
};

export default MediaAdded;

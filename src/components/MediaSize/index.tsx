import { formatBytes } from '@app/utils/numberHelpers';
import type { ReactNode } from 'react';
import useSWR from 'swr';

interface MediaSizeProps {
  mediaId?: number;
  is4k?: boolean;
  label?: ReactNode;
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
}

const MediaSize = ({
  mediaId,
  is4k = false,
  label,
  className,
  containerClassName,
  labelClassName,
}: MediaSizeProps) => {
  const { data } = useSWR<{ size: number | null }>(
    mediaId ? `/api/v1/media/${mediaId}/size?is4k=${is4k}` : null
  );

  if (!data?.size) {
    return null;
  }

  if (label) {
    return (
      <div className={containerClassName}>
        <span className={labelClassName}>{label}</span>
        <span className={className}>{formatBytes(data.size)}</span>
      </div>
    );
  }

  return <span className={className}>{formatBytes(data.size)}</span>;
};

export default MediaSize;

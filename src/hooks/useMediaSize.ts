import useSWR from 'swr';

export interface MediaSeasonSize {
  seasonNumber: number;
  size: number;
}

export interface MediaSizeResponse {
  size: number | null;
  seasons?: MediaSeasonSize[] | null;
}

export const useMediaSize = (mediaId?: number, is4k = false) => {
  const { data } = useSWR<MediaSizeResponse>(
    mediaId ? `/api/v1/media/${mediaId}/size?is4k=${is4k}` : null
  );

  return data;
};

export default useMediaSize;

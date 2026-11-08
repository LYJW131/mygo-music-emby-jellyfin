// What Emby answers, as far as the plugin reads it.

export interface NameId {
  Name: string;
  Id: string;
}

export interface MediaStream {
  Type: "Audio" | "Video" | "Subtitle" | "EmbeddedImage" | string;
  Codec?: string;
  Index: number;
  IsExternal?: boolean;
  BitRate?: number;
  BitDepth?: number;
  SampleRate?: number;
  Channels?: number;
}

export interface MediaSource {
  Id: string;
  Container?: string;
  Size?: number;
  Bitrate?: number;
  MediaStreams?: MediaStream[];
}

export interface UserData {
  IsFavorite?: boolean;
  PlayCount?: number;
  Played?: boolean;
  LastPlayedDate?: string;
}

export interface Item {
  Id: string;
  Name?: string;
  Type?: string;
  MediaType?: string | null;
  Container?: string;
  RunTimeTicks?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ProductionYear?: number;
  PremiereDate?: string;
  Overview?: string;
  ChildCount?: number;
  SongCount?: number;
  AlbumCount?: number;
  Album?: string;
  AlbumId?: string;
  AlbumPrimaryImageTag?: string;
  AlbumArtist?: string;
  AlbumArtists?: NameId[];
  Artists?: string[];
  ArtistItems?: NameId[];
  ImageTags?: Record<string, string>;
  PrimaryImageTag?: string;
  PlaylistItemId?: string;
  /** Jellyfin: the song has lyrics at /Audio/{id}/Lyrics. */
  HasLyrics?: boolean;
  CanDelete?: boolean;
  UserData?: UserData;
  MediaSources?: MediaSource[];
  MediaStreams?: MediaStream[];
}

export interface Items {
  Items: Item[];
  TotalRecordCount?: number;
}

export interface User {
  Id: string;
  Name: string;
  PrimaryImageTag?: string;
  Policy?: { IsAdministrator?: boolean; IsDisabled?: boolean; IsHidden?: boolean };
}

/** Jellyfin's /Audio/{id}/Lyrics. A cue times the characters from Position to EndPosition. */
export interface JellyfinLyrics {
  Lyrics?: {
    Text?: string;
    Start?: number | null;
    Cues?: { Position: number; EndPosition: number; Start: number; End?: number | null }[] | null;
  }[];
}

export interface TrackEvent {
  Text?: string;
  StartPositionTicks?: number;
  EndPositionTicks?: number;
}

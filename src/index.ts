// Emby, for MyGo Music: the music on the listener's own Emby server, with
// their favorites, playlists and play counts, and lyrics from .lrc files.
// Songs play as the files are, ALAC and FLAC included, or transcoded by
// Emby when the quality asked for is lower or the app can't play the file.
//
// These exports are the plugin: what MyGo Music calls.

import * as acc from "./account.ts";
import * as lib from "./library.ts";
import * as ly from "./lyrics.ts";
import * as pg from "./pages.ts";
import * as se from "./search.ts";
import * as st from "./stations.ts";
import * as sm from "./stream.ts";

export const account = acc.account;
export const signIn = acc.signIn;
export const signOut = acc.signOut;
export const setSetting = acc.setSetting;

export const home = pg.home;
export const browse = pg.browse;
export const album = pg.album;
export const artist = pg.artist;

export const search = se.search;
export const suggest = se.suggest;

export const recent = () => lib.recent();
export const played = lib.played;
export const liked = lib.liked;
export const isLiked = lib.isLiked;
export const like = lib.like;
export const savedAlbums = lib.savedAlbums;

export const playlists = lib.playlists;
export const playlist = lib.playlist;
export const createPlaylist = lib.createPlaylist;
export const renamePlaylist = lib.renamePlaylist;
export const deletePlaylist = lib.deletePlaylist;
export const addToPlaylist = lib.addToPlaylist;
export const removeFromPlaylist = lib.removeFromPlaylist;
export const movePlaylistTrack = lib.movePlaylistTrack;

export const stations = st.stations;
export const stationNext = st.stationNext;

export const lyrics = ly.lyrics;
export const stream = sm.stream;

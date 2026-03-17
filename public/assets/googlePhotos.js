// ============================================================
// assets/googlePhotos.js — DEPRECATED stub
//
// Google removed the photoslibrary.readonly scope and the Library API's
// browse/search endpoints for existing user albums on March 31, 2025.
// Google Photos is no longer a supported slideshow provider in HomeHub.
//
// Hub.googlePhotos is kept as an empty stub so any old call sites don't
// throw ReferenceErrors. All photo loading now goes through photos.js
// using Imgur or Immich.
// ============================================================
window.Hub = window.Hub || {};

Hub.googlePhotos = {
  getImages()      { return Promise.resolve([]); },
  getAlbums()      { return Promise.resolve([]); },
  getToken()       { return Promise.resolve(null); },
  listAlbums()     { return Promise.resolve([]); },
};

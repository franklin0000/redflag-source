// ioRef.js — shared Socket.io instance for use in route handlers
let _io = null;
module.exports = {
  setIO: (io) => { _io = io; },
  getIO: () => _io,
};

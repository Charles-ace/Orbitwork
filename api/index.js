module.exports = (req, res) => {
  res.end(JSON.stringify({ ok: true, message: 'api works!' }));
};

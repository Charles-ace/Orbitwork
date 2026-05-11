module.exports = (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const axios = require('axios');
  const { ethers } = require('ethers');
  res.end(JSON.stringify({ ok: true, id: uuidv4(), hasAxios: !!axios, hasEthers: !!ethers }));
};

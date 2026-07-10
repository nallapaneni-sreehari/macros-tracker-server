const storageService = require('../services/storage.service');

async function getValue(req, res, next) {
  try {
    const value = await storageService.getValue(req.params.userId, req.params.key);
    res.json({ value });
  } catch (err) {
    next(err);
  }
}

async function setValue(req, res, next) {
  try {
    await storageService.setValue(req.params.userId, req.params.key, req.body.value);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function deleteValue(req, res, next) {
  try {
    await storageService.deleteValue(req.params.userId, req.params.key);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function listKeys(req, res, next) {
  try {
    const keys = await storageService.listKeys(req.params.userId);
    res.json({ keys });
  } catch (err) {
    next(err);
  }
}

module.exports = { getValue, setValue, deleteValue, listKeys };

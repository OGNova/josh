/* eslint-disable valid-jsdoc */
const sqlite = require('sqlite');

// Lodash should probably be a core lib but hey, it's useful!
const _ = require('lodash');

// Native imports
const { resolve, sep } = require('path');
const fs = require('fs');

module.exports = class JoshProvider {

  constructor(options) {
    if (!options.name) throw new Error('Must provide options.name');

    this.defer = new Promise((resolve) => { // eslint-disable-line no-shadow
      this.ready = resolve;
    });

    this.dataDir = resolve(process.cwd(), options.dataDir || 'data');

    if (!options.dataDir) {
      if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
      }
    }

    this.name = options.name;
    this.validateName();
    this.dbName = options.dbName || 'defaultenmap';
  }

  /**
   * Internal method called on persistent Enmaps to load data from the underlying database.
   * @param {Map} enmap In order to set data to the Enmap, one must be provided.
   * @returns {Promise} Returns the defer promise to await the ready state.
   */
  async init() { // eslint-disable-line consistent-return
    this.db = await sqlite.open(`${this.dataDir}${sep}josh.sqlite`);
    const table = await this.db.get(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name = '${this.name}';`);
    if (!table['count(*)']) {
      await this.db.run(`CREATE TABLE ${this.name} (key text PRIMARY KEY, value text)`);
      await this.db.run('PRAGMA synchronous = 1;');
      await this.db.run('PRAGMA journal_mode = wal;');
      this.ready();
      return this.defer;
    }
  }

  /**
   * Force fetch one or more key values from the database. If the database has changed, that new value is used.
   * @param {string|number|Array<string|number>} keyOrKeys A single key or array of keys to force fetch from the database.
   * @return {Enmap|*} The Enmap, including the new fetched values, or the value in case the function argument is a single key.
   */
  get(keyOrKeys) {
    if (_.isArray(keyOrKeys)) {
      return this.db.prepare(`SELECT * FROM ${this.name} WHERE key IN (${'?, '.repeat(keyOrKeys.length).slice(0, -2)})`)
        .then(stmt => stmt.all(keyOrKeys))
        .then(res => res.map(row => [row.key, JSON.parse(row.value)]));
    } else {
      return this.db.prepare(`SELECT * FROM ${this.name} WHERE key = ?;`)
        .then(stmt => stmt.get(keyOrKeys))
        .then(res => this.parseData(res.value));
    }
  }


  /**
   * Set a value to the Enmap.
   * @param {(string|number)} key Required. The key of the element to add to the EnMap object.
   * If the EnMap is persistent this value MUST be a string or number.
   * @param {*} val Required. The value of the element to add to the EnMap object.
   * If the EnMap is persistent this value MUST be stringifiable as JSON.
   */
  set(key, val) {
    if (!key || !['String', 'Number'].includes(key.constructor.name)) {
      throw new Error('SQLite require keys to be strings or numbers.');
    }
    return this.db.run(`INSERT OR REPLACE INTO ${this.name} (key, value) VALUES (?, ?);`, [key.toString(), JSON.stringify(val)]);
  }

  /**
   * Delete an entry from the Enmap.
   * @param {(string|number)} key Required. The key of the element to delete from the EnMap object.
   * @param {boolean} bulk Internal property used by the purge method.
   */
  async delete(key) {
    await this.db.run(`DELETE FROM ${this.name} WHERE key = ?`, [key]);
  }

  /**
   * Retrieves the number of rows in the database for this enmap, even if they aren't fetched.
   * @return {integer} The number of rows in the database.
   */
  async count() {
    const data = await (await this.db.prepare(`SELECT count(*) FROM '${this.name}';`)).get();
    return data['count(*)'];
  }

  /**
   * Retrieves all the indexes (keys) in the database for this enmap, even if they aren't fetched.
   * @return {array<string>} Array of all indexes (keys) in the enmap, cached or not.
   */
  async keys() {
    const rows = await (await this.db.prepare(`SELECT key FROM '${this.name}';`)).all();
    return rows.map(row => row.key);
  }

  async clear() {
    this.db.exec(`DELETE FROM ${this.name}`);
  }

  /**
   * Shuts down the underlying persistent enmap database.
   */
  close() {
    this.db.close();
  }

  keyCheck(key) {
    if (_.isNil(key) || !['String', 'Number'].includes(key.constructor.name)) {
      throw new Error('josh-sqlite require keys to be strings or numbers.');
    }
  }

  /**
   * Internal method used to validate persistent enmap names (valid Windows filenames)
   * @private
   */
  validateName() {
    // Do not delete this internal method.
    this.name = this.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  parseData(data) {
    return JSON.parse(data);
  }

};

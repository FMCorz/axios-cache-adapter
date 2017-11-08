import axios from 'axios'
import omit from 'lodash/omit'
import merge from 'lodash/merge'
import isFunction from 'lodash/isFunction'

import { key, read } from './cache'
import MemoryStore from './memory'
import request from './request'

// ---------------------
// Cache Adapter
// ---------------------

const defaults = {
  cache: {
    maxAge: 0,
    limit: false,
    store: null,
    key: null,
    exclude: {
      paths: [],
      query: true,
      filter: null
    },
    adapter: axios.defaults.adapter,
    clearOnStale: true,
    clearOnError: true,
    readOnError: false,
    debug: false
  },
  axios: {
    cache: {
      maxAge: 15 * 60 * 1000
    }
  }
}

/**
 * Configure cache adapter
 *
 * @param   {object} [config={}] Cache adapter options
 * @returns {object} Object containing cache `adapter` and `store`
 */
function setupCache (config = {}) {
  // Extend default configuration
  config = merge({}, defaults.cache, config)

  // Watch out for configuration conflicts
  if (config.readOnError) config.clearOnStale = false

  // Create a cache key method
  config.key = key(config)

  // If debug mode is on, create a simple logger method
  if (config.debug !== false) {
    config.debug = (typeof config.debug === 'function')
      ? config.debug
      : (...args) => console.log('[axios-cache-adapter]', ...args)
  } else {
    config.debug = () => {}
  }

  // Create an in memory store if none was given
  if (!config.store) config.store = new MemoryStore()

  // Axios adapter. Receives the axios request configuration as only parameter
  async function adapter (req) {
    // Execute request against local cache
    let res = await request(config, req)

    const requestConfig = res.config
    let next = res.next

    // Response is not function, something was in cache, return it
    if (!isFunction(next)) return next

    // Nothing in cache so we execute the default adapter or any given adapter
    // Will throw if the request has a status different than 2xx
    try {
      res = await config.adapter(req)
    } catch (err) {
      if (config.readOnError) {
        // Force cache tu return stale data
        requestConfig.acceptStale = true

        // Try to read from cache again
        res = await request(requestConfig, req)

        // Signal that data is from stale cache
        res.next.request.stale = true

        // No need to check if `next` is a function just return cache data
        return res.next
      }
    }

    // Process response to store in cache
    return next(res)
  }

  // Return adapter and store instance
  return {
    adapter,
    config,
    store: config.store
  }
}

// ---------------------
// Easy API Setup
// ---------------------

/**
 * Setup an axios instance with the cache adapter pre-configured
 *
 * @param {object} [options={}] Axios and cache adapter options
 * @returns {object} Instance of Axios
 */
function setup (config = {}) {
  config = merge({}, defaults.axios, config)

  const cache = setupCache(config.cache)
  const axiosConfig = omit(config, ['cache'])

  const api = axios.create(
    merge({}, axiosConfig, { adapter: cache.adapter })
  )

  api.cache = cache.store

  return api
}

export { setup, setupCache }
export default { setup, setupCache }

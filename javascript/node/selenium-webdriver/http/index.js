// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * @fileoverview Defines a {@link webdriver.CommandExecutor} that communicates
 * with a remote end using HTTP + JSON.
 */

'use strict';

const http = require('http');
const url = require('url');

const error = require('../error');
const base = require('../lib/_base');
const CName = base.require('webdriver.CommandName');
const logging = base.require('webdriver.logging');



/**
 * Converts a headers map to a HTTP header block string.
 * @param {!Map<string, string>} headers The map to convert.
 * @return {string} The headers as a string.
 */
function headersToString(headers) {
  let ret = [];
  headers.forEach((value, name) => ret.push(`${name.toLowerCase()}: ${value}`));
  return ret.join('\n');
}


/**
 * Represents a HTTP request message. This class is a "partial" request and only
 * defines the path on the server to send a request to. It is each client's
 * responsibility to build the full URL for the final request.
 * @final
 */
class HttpRequest {
  /**
   * @param {string} method The HTTP method to use for the request.
   * @param {string} path The path on the server to send the request to.
   * @param {Object=} opt_data This request's non-serialized JSON payload data.
   */
  constructor(method, path, opt_data) {
    this.method = /** string */method;
    this.path = /** string */path;
    this.data = /** Object */opt_data;
    this.headers = /** !Map<string, string> */new Map(
        [['Accept', 'application/json; charset=utf-8']]);
  }

  /** @override */
  toString() {
    let ret = `${this.method} ${this.path} HTTP/1.1\n`;
    ret += headersToString(this.headers) + '\n\n';
    if (this.data) {
      ret += JSON.stringify(this.data);
    }
    return ret;
  }
}


/**
 * Represents a HTTP response message.
 * @final
 */
class HttpResponse {
  /**
   * @param {number} status The response code.
   * @param {!Object<string>} headers The response headers. All header names
   *     will be converted to lowercase strings for consistent lookups.
   * @param {string} body The response body.
   */
  constructor(status, headers, body) {
    this.status = /** number */status;
    this.body = /** string */body;
    this.headers = /** !Map<string, string>*/new Map;
    for (let header in headers) {
      this.headers.set(header.toLowerCase(), headers[header]);
    }
  }

  /** @override */
  toString() {
    let ret = `HTTP/1.1 ${this.status}\n${headersToString(this.headers)}\n\n`;
    if (this.body) {
      ret += this.body;
    }
    return ret;
  }
}


function post(path) { return resource('POST', path); }
function del(path)  { return resource('DELETE', path); }
function get(path)  { return resource('GET', path); }
function resource(method, path) { return {method: method, path: path}; }


/** @const {!Map<CName, {method: string, path: string}>} */
const COMMAND_MAP = new Map([
    [CName.GET_SERVER_STATUS, get('/status')],
    [CName.NEW_SESSION, post('/session')],
    [CName.GET_SESSIONS, get('/sessions')],
    [CName.DESCRIBE_SESSION, get('/session/:sessionId')],
    [CName.QUIT, del('/session/:sessionId')],
    [CName.CLOSE, del('/session/:sessionId/window')],
    [CName.GET_CURRENT_WINDOW_HANDLE, get('/session/:sessionId/window_handle')],
    [CName.GET_WINDOW_HANDLES, get('/session/:sessionId/window_handles')],
    [CName.GET_CURRENT_URL, get('/session/:sessionId/url')],
    [CName.GET, post('/session/:sessionId/url')],
    [CName.GO_BACK, post('/session/:sessionId/back')],
    [CName.GO_FORWARD, post('/session/:sessionId/forward')],
    [CName.REFRESH, post('/session/:sessionId/refresh')],
    [CName.ADD_COOKIE, post('/session/:sessionId/cookie')],
    [CName.GET_ALL_COOKIES, get('/session/:sessionId/cookie')],
    [CName.DELETE_ALL_COOKIES, del('/session/:sessionId/cookie')],
    [CName.DELETE_COOKIE, del('/session/:sessionId/cookie/:name')],
    [CName.FIND_ELEMENT, post('/session/:sessionId/element')],
    [CName.FIND_ELEMENTS, post('/session/:sessionId/elements')],
    [CName.GET_ACTIVE_ELEMENT, post('/session/:sessionId/element/active')],
    [CName.FIND_CHILD_ELEMENT, post('/session/:sessionId/element/:id/element')],
    [CName.FIND_CHILD_ELEMENTS, post('/session/:sessionId/element/:id/elements')],
    [CName.CLEAR_ELEMENT, post('/session/:sessionId/element/:id/clear')],
    [CName.CLICK_ELEMENT, post('/session/:sessionId/element/:id/click')],
    [CName.SEND_KEYS_TO_ELEMENT, post('/session/:sessionId/element/:id/value')],
    [CName.SUBMIT_ELEMENT, post('/session/:sessionId/element/:id/submit')],
    [CName.GET_ELEMENT_TEXT, get('/session/:sessionId/element/:id/text')],
    [CName.GET_ELEMENT_TAG_NAME, get('/session/:sessionId/element/:id/name')],
    [CName.IS_ELEMENT_SELECTED, get('/session/:sessionId/element/:id/selected')],
    [CName.IS_ELEMENT_ENABLED, get('/session/:sessionId/element/:id/enabled')],
    [CName.IS_ELEMENT_DISPLAYED, get('/session/:sessionId/element/:id/displayed')],
    [CName.GET_ELEMENT_LOCATION, get('/session/:sessionId/element/:id/location')],
    [CName.GET_ELEMENT_SIZE, get('/session/:sessionId/element/:id/size')],
    [CName.GET_ELEMENT_ATTRIBUTE, get('/session/:sessionId/element/:id/attribute/:name')],
    [CName.GET_ELEMENT_VALUE_OF_CSS_PROPERTY, get('/session/:sessionId/element/:id/css/:propertyName')],
    [CName.ELEMENT_EQUALS, get('/session/:sessionId/element/:id/equals/:other')],
    [CName.TAKE_ELEMENT_SCREENSHOT, get('/session/:sessionId/element/:id/screenshot')],
    [CName.SWITCH_TO_WINDOW, post('/session/:sessionId/window')],
    [CName.MAXIMIZE_WINDOW, post('/session/:sessionId/window/:windowHandle/maximize')],
    [CName.GET_WINDOW_POSITION, get('/session/:sessionId/window/:windowHandle/position')],
    [CName.SET_WINDOW_POSITION, post('/session/:sessionId/window/:windowHandle/position')],
    [CName.GET_WINDOW_SIZE, get('/session/:sessionId/window/:windowHandle/size')],
    [CName.SET_WINDOW_SIZE, post('/session/:sessionId/window/:windowHandle/size')],
    [CName.SWITCH_TO_FRAME, post('/session/:sessionId/frame')],
    [CName.GET_PAGE_SOURCE, get('/session/:sessionId/source')],
    [CName.GET_TITLE, get('/session/:sessionId/title')],
    [CName.EXECUTE_SCRIPT, post('/session/:sessionId/execute')],
    [CName.EXECUTE_ASYNC_SCRIPT, post('/session/:sessionId/execute_async')],
    [CName.SCREENSHOT, get('/session/:sessionId/screenshot')],
    [CName.SET_TIMEOUT, post('/session/:sessionId/timeouts')],
    [CName.SET_SCRIPT_TIMEOUT, post('/session/:sessionId/timeouts/async_script')],
    [CName.IMPLICITLY_WAIT, post('/session/:sessionId/timeouts/implicit_wait')],
    [CName.MOVE_TO, post('/session/:sessionId/moveto')],
    [CName.CLICK, post('/session/:sessionId/click')],
    [CName.DOUBLE_CLICK, post('/session/:sessionId/doubleclick')],
    [CName.MOUSE_DOWN, post('/session/:sessionId/buttondown')],
    [CName.MOUSE_UP, post('/session/:sessionId/buttonup')],
    [CName.MOVE_TO, post('/session/:sessionId/moveto')],
    [CName.SEND_KEYS_TO_ACTIVE_ELEMENT, post('/session/:sessionId/keys')],
    [CName.TOUCH_SINGLE_TAP, post('/session/:sessionId/touch/click')],
    [CName.TOUCH_DOUBLE_TAP, post('/session/:sessionId/touch/doubleclick')],
    [CName.TOUCH_DOWN, post('/session/:sessionId/touch/down')],
    [CName.TOUCH_UP, post('/session/:sessionId/touch/up')],
    [CName.TOUCH_MOVE, post('/session/:sessionId/touch/move')],
    [CName.TOUCH_SCROLL, post('/session/:sessionId/touch/scroll')],
    [CName.TOUCH_LONG_PRESS, post('/session/:sessionId/touch/longclick')],
    [CName.TOUCH_FLICK, post('/session/:sessionId/touch/flick')],
    [CName.ACCEPT_ALERT, post('/session/:sessionId/accept_alert')],
    [CName.DISMISS_ALERT, post('/session/:sessionId/dismiss_alert')],
    [CName.GET_ALERT_TEXT, get('/session/:sessionId/alert_text')],
    [CName.SET_ALERT_TEXT, post('/session/:sessionId/alert_text')],
    [CName.GET_LOG, post('/session/:sessionId/log')],
    [CName.GET_AVAILABLE_LOG_TYPES, get('/session/:sessionId/log/types')],
    [CName.GET_SESSION_LOGS, post('/logs')],
    [CName.UPLOAD_FILE, post('/session/:sessionId/file')],
]);


/**
 * A basic HTTP client used to send messages to a remote end.
 */
class HttpClient {
  /**
   * @param {string} serverUrl URL for the WebDriver server to send commands to.
   * @param {http.Agent=} opt_agent The agent to use for each request.
   *     Defaults to `http.globalAgent`.
   * @param {string=} opt_proxy The proxy to use for the connection to the
   *     server. Default is to use no proxy.
   */
  constructor(serverUrl, opt_agent, opt_proxy) {
    let parsedUrl = url.parse(serverUrl);
    if (!parsedUrl.hostname) {
      throw new Error('Invalid server URL: ' + serverUrl);
    }

    /** @private {http.Agent} */
    this.agent_ = opt_agent;

    /** @private {string} */
    this.proxy_ = opt_proxy;

    /**
     * Base options for each request.
     * @private {!Object}
     */
    this.options_ = {
      auth: parsedUrl.auth,
      host: parsedUrl.hostname,
      path: parsedUrl.pathname,
      port: parsedUrl.port
    };
  }

  /**
   * Sends a request to the server. The client will automatically follow any
   * redirects returned by the server, fulfilling the returned promise with the
   * final response.
   *
   * @param {!HttpRequest} httpRequest The request to send.
   * @return {!Promise<HttpResponse>} A promise that will be fulfilled with the
   *     server's response.
   */
  send(httpRequest) {
    var data;
    httpRequest.headers['Content-Length'] = 0;
    if (httpRequest.method == 'POST' || httpRequest.method == 'PUT') {
      data = JSON.stringify(httpRequest.data);
      httpRequest.headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
      httpRequest.headers['Content-Type'] = 'application/json;charset=UTF-8';
    }

    var path = this.options_.path;
    if (path[path.length - 1] === '/' && httpRequest.path[0] === '/') {
      path += httpRequest.path.substring(1);
    } else {
      path += httpRequest.path;
    }

    var options = {
      method: httpRequest.method,
      auth: this.options_.auth,
      host: this.options_.host,
      port: this.options_.port,
      path: path,
      headers: httpRequest.headers
    };

    if (this.agent_) {
      options.agent = this.agent_;
    }

    var proxy = this.proxy_;
    return new Promise(function(fulfill, reject) {
      sendRequest(options, fulfill, reject, data, proxy);
    });
  }
}


/**
 * Sends a single HTTP request.
 * @param {!Object} options The request options.
 * @param {function(!HttpResponse)} onOk The function to call if the
 *     request succeeds.
 * @param {function(!Error)} onError The function to call if the request fails.
 * @param {string=} opt_data The data to send with the request.
 * @param {string=} opt_proxy The proxy server to use for the request.
 */
function sendRequest(options, onOk, onError, opt_data, opt_proxy) {
  var host = options.host;
  var port = options.port;

  if (opt_proxy) {
    var proxy = url.parse(opt_proxy);

    options.headers['Host'] = options.host;
    options.host = proxy.hostname;
    options.port = proxy.port;

    if (proxy.auth) {
      options.headers['Proxy-Authorization'] =
          'Basic ' + new Buffer(proxy.auth).toString('base64');
    }
  }

  var request = http.request(options, function(response) {
    if (response.statusCode == 302 || response.statusCode == 303) {
      try {
        var location = url.parse(response.headers['location']);
      } catch (ex) {
        onError(Error(
            'Failed to parse "Location" header for server redirect: ' +
            ex.message + '\nResponse was: \n' +
            new HttpResponse(response.statusCode, response.headers, '')));
        return;
      }

      if (!location.hostname) {
        location.hostname = host;
        location.port = port;
      }

      request.abort();
      sendRequest({
        method: 'GET',
        host: location.hostname,
        path: location.pathname + (location.search || ''),
        port: location.port,
        headers: {
          'Accept': 'application/json; charset=utf-8'
        }
      }, onOk, onError, undefined, opt_proxy);
      return;
    }

    var body = [];
    response.on('data', body.push.bind(body));
    response.on('end', function() {
      var resp = new HttpResponse(response.statusCode,
          response.headers, body.join('').replace(/\0/g, ''));
      onOk(resp);
    });
  });

  request.on('error', function(e) {
    if (e.code === 'ECONNRESET') {
      setTimeout(function() {
        sendRequest(options, onOk, onError, opt_data, opt_proxy);
      }, 15);
    } else {
      var message = e.message;
      if (e.code) {
        message = e.code + ' ' + message;
      }
      onError(new Error(message));
    }
  });

  if (opt_data) {
    request.write(opt_data);
  }

  request.end();
}


/**
 * A command executor that communicates with the server using HTTP + JSON.
 * @implements {webdriver.CommandExecutor}
 */
class Executor {
  /**
   * @param {!HttpClient} client The client to use for sending requests to the
   *     server.
   */
  constructor(client) {
    /** @private {!HttpClient} */
    this.client_ = client;

    /** @private {Map<string, {method: string, path: string}>} */
    this.customCommands_ = null;

    /** @private {!webdriver.logging.Logger} */
    this.log_ = logging.getLogger('webdriver.http.Executor');
  }

  /**
   * Defines a new command for use with this executor. When a command is sent,
   * the {@code path} will be preprocessed using the command's parameters; any
   * path segments prefixed with ":" will be replaced by the parameter of the
   * same name. For example, given "/person/:name" and the parameters
   * "{name: 'Bob'}", the final command path will be "/person/Bob".
   *
   * @param {string} name The command name.
   * @param {string} method The HTTP method to use when sending this command.
   * @param {string} path The path to send the command to, relative to
   *     the WebDriver server's command root and of the form
   *     "/path/:variable/segment".
   */
  defineCommand(name, method, path) {
    if (!this.customCommands_) {
      this.customCommands_ = new Map;
    }
    this.customCommands_.set(name, {method, path});
  }

  /** @override */
  execute(command) {
    let resource =
        (this.customCommands_ && this.customCommands_.get(command.getName()))
        || COMMAND_MAP.get(command.getName());
    if (!resource) {
      throw new error.UnknownCommandError(
          'Unrecognized command: ' + command.getName());
    }

    let parameters = command.getParameters();
    let path = buildPath(resource.path, parameters);
    let request = new HttpRequest(resource.method, path, parameters);

    let log = this.log_;
    log.finer(() => '>>>\n' + request);
    return this.client_.send(request).then(function(response) {
      log.finer(() => '<<<\n' + response);
      return parseHttpResponse(/** @type {!HttpResponse} */ (response));
    });
  }
}


/**
 * Callback used to parse {@link HttpResponse} objects from a
 * {@link HttpClient}.
 * @param {!HttpResponse} httpResponse The HTTP response to parse.
 * @return {!bot.response.ResponseObject} The parsed response.
 */
function parseHttpResponse(httpResponse) {
  try {
    return /** @type {!bot.response.ResponseObject} */ (JSON.parse(
        httpResponse.body));
  } catch (ignored) {
    // Whoops, looks like the server sent us a malformed response. We'll need
    // to manually build a response object based on the response code.
  }

  let response = {
    'status': error.ErrorCode.SUCCESS,
    'value': httpResponse.body.replace(/\r\n/g, '\n')
  };

  if (httpResponse.status >= 400) {
    // 404 represents an unknown command; anything else is a generic unknown
    // error.
    response['status'] = httpResponse.status == 404 ?
        error.ErrorCode.UNKNOWN_COMMAND :
        error.ErrorCode.UNKNOWN_ERROR;
  }

  return response;
}


/**
 * Builds a fully qualified path using the given set of command parameters. Each
 * path segment prefixed with ':' will be replaced by the value of the
 * corresponding parameter. All parameters spliced into the path will be
 * removed from the parameter map.
 * @param {string} path The original resource path.
 * @param {!Object<*>} parameters The parameters object to splice into the path.
 * @return {string} The modified path.
 */
function buildPath(path, parameters) {
  let pathParameters = path.match(/\/:(\w+)\b/g);
  if (pathParameters) {
    for (let i = 0; i < pathParameters.length; ++i) {
      let key = pathParameters[i].substring(2);  // Trim the /:
      if (key in parameters) {
        let value = parameters[key];
        // TODO: move webdriver.WebElement.ELEMENT definition to a
        // common file so we can reference it here without pulling in all of
        // webdriver.WebElement's dependencies.
        if (value && value['ELEMENT']) {
          // When inserting a WebElement into the URL, only use its ID value,
          // not the full JSON.
          value = value['ELEMENT'];
        }
        path = path.replace(pathParameters[i], '/' + value);
        delete parameters[key];
      } else {
        throw new error.InvalidArgumentError(
            'Missing required parameter: ' + key);
      }
    }
  }
  return path;
}


// PUBLIC API

exports.Executor = Executor;
exports.HttpClient = HttpClient;
exports.Request = HttpRequest;
exports.Response = HttpResponse;
exports.buildPath = buildPath;  // Exported for testing.
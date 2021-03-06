#!/usr/bin/env node


"use strict";

var util = require('util');
var https = require('https');
var apiVersionPath = "/api/v2";
var intervalObj;
var events = require('events');
var ANALYZE_POLL_INTERVAL = 30000;
var debug = true;
var apiHost = 'api.ssllabs.com';
var apiLocation = 'https://' + apiHost + apiVersionPath;
var userAgent = "nodejs-ssllabs-api v0.0.1 (dev $Id$)";

function debugLog(log){
  if (debug === true){
    console.log(log);
  }
}

// Instantiate if one not already created/new'ed
function SslLabsApi(hostToAnalyze, consoleDebug){
  if (!(this instanceof SslLabsApi)){
    return new SslLabsApi(hostToAnalyze, consoleDebug);
  }

  this.options = {
    host: apiHost,
    method: 'GET',
    path: '/'
  };

  events.EventEmitter.call(this);
  this.hostToAnalyze = hostToAnalyze;
  this.httpReqTimeoutValueInMs = 5000;
  debug = consoleDebug;
}

// extent the SslLabsApi object using EventEmitter
util.inherits(SslLabsApi, events.EventEmitter);


SslLabsApi.prototype._emitError = function _emitError(e){
  debugLog(e);
  clearInterval(intervalObj);
  this.emit('error', e);
};

SslLabsApi.prototype.version = function version(){
  return ('\r\nUser Agent  : ' + userAgent + 
          '\r\nAPI Location: ' + apiLocation
          + '\r\n');
}

SslLabsApi.prototype.info = function info(){
  this.options.path = apiVersionPath + '/info';
  var req = https.request(this.options, this.infoResponse.bind(this));
  req.setTimeout(this.httpReqTimeoutValueInMs, function() {
    req.abort();
  });

  req.on('error', this._emitError.bind(this));
  req.end();
};


SslLabsApi.prototype.analyzeHost = function analyzeHost(){
  this.options.path = apiVersionPath + '/analyze?host=' + this.hostToAnalyze;
  debugLog(this.options.path);
  var req = https.request(this.options, this.analyzeResponse.bind(this));
  req.setTimeout(this.httpReqTimeoutValueInMs, function() {
    req.abort();
  });

  req.on('error', this._emitError.bind(this));
  req.end();
};


SslLabsApi.prototype.analyzeHostCached = function analyzeHostCached(maxAge){
  if(maxAge === undefined){
    this.options.path = apiVersionPath + '/analyze?host=' + this.hostToAnalyze + '&fromCache=on&all=done';
  }
  else{
    this.options.path = apiVersionPath + '/analyze?host=' + this.hostToAnalyze + '&fromCache=on&all=done' + '&maxAge=' + maxAge;
  }
  debugLog(this.options.path);
  var req = https.request(this.options, this.analyzeResponse.bind(this));

  function handleTimeout(){
    debugLog('Request timed out');
    clearInterval(intervalObj);
    req.abort();
  }

  req.setTimeout(this.httpReqTimeoutValueInMs, handleTimeout);
  req.end();
  this.startPoll();

 req.on('error', this._emitError.bind(this));
};

SslLabsApi.prototype.analyzeHostNew = function analyzeHostNew(){
  debugLog('2 hostToAnalyze = ' + this.hostToAnalyze);
  this.options.path = apiVersionPath + '/analyze?host=' + this.hostToAnalyze + '&startNew=on&all=done';
  debugLog(this.options.path);
  var req = https.request(this.options, this.analyzeResponse.bind(this));

  function handleTimeout(){
    debugLog('Request timed out');
    clearInterval(intervalObj);
    req.abort();
  }

  req.setTimeout(this.httpReqTimeoutValueInMs, handleTimeout);
  req.on('error', this._emitError.bind(this));
  req.end();
  this.startPoll();
};

SslLabsApi.prototype.getEndpointData = function getEndpointData(endpoint){
  this.options.path = apiVersionPath + '/getEndpointData?host=' + this.hostToAnalyze + '&s=' + endpoint;
  var req = https.request(this.options, this.endpointResponse.bind(this));

  function handleTimeout(){
    debugLog('Request timed out');
    clearInterval(intervalObj);
    req.abort();
  }

  req.setTimeout(this.httpReqTimeoutValueInMs, handleTimeout);
  req.on('error', this._emitError.bind(this));
  req.end();
};

SslLabsApi.prototype.getStatusCodes = function getStatusCodes(){
  this.options.path = apiVersionPath + '/getStatusCodes';
  var req = https.request(this.options, this.statusCodesResponse.bind(this));

  function handleTimeout(){
    debugLog('Request timed out');
    clearInterval(intervalObj);
    req.abort();
  }

  req.setTimeout(this.httpReqTimeoutValueInMs, handleTimeout);
  req.end();
  req.on('error', this._emitError.bind(this));
};


SslLabsApi.prototype.analyzeResponse = function analyzeResponse(resp){
  var self = this;
  var respBody = '';

  resp.on('data', function (chunk){
    respBody += chunk;
  });

  resp.on('Error', function(e){
    console.log('This is the error dump', e);
  });

  resp.on('end', function(){
    //debugLog(respBody);
    if (respBody.length){
      var jsonResp = JSON.parse(respBody);
      //console.log(respBody);
      if (jsonResp.status) {
        if(jsonResp.status === "READY"){
          self.emit('analyzeData', /*jsonResp*/respBody);
          clearInterval(intervalObj);
          debugLog("assessment complete");
        } else if((jsonResp.status === "DNS") || (jsonResp.status === "IN_PROGRESS")){
          debugLog(jsonResp.status);
        }else if(jsonResp.status === "ERROR"){
          self._emitError(jsonResp.statusMessage);
        }else{
          self._emitError('Unknown Response Received');
        }
      } else{
        self._emitError(jsonResp);
      }
    }else{
      self._emitError('No Response Body Received');
    }
  });
};

function processResponse(obj, resp, eventType){
  var self = obj;
  var respBody = '';
  resp.on('data', function (chunk){
    respBody += chunk;
  });

  resp.on('end', function(){
    var jsonResp = JSON.parse(respBody);
    self.emit(eventType, jsonResp);
  });
}


SslLabsApi.prototype.endpointResponse = function endpointResponse(resp){
  processResponse(this, resp, 'endpointData');
};


SslLabsApi.prototype.statusCodesResponse = function statusCodesResponse(resp){
  processResponse(this, resp, 'statusCodesData');
};


SslLabsApi.prototype.infoResponse = function infoResponse(resp){
  processResponse(this, resp, 'infoResponse');
};


SslLabsApi.prototype.pollAnalyzeRequest = function pollAnalyzeRequest() {
  this.options.path = apiVersionPath + '/analyze?host=' + this.hostToAnalyze;
  var req = https.request(this.options, this.analyzeResponse.bind(this));

  function handleTimeout(){
    debugLog('Request timed out');
    clearInterval(intervalObj);
    req.abort();
  }

  req.setTimeout(this.httpReqTimeoutValueInMs, handleTimeout);
  req.on('error', this._emitError.bind(this));
  req.end();
};


SslLabsApi.prototype.startPoll = function startPoll(){
  debugLog('4 hostToAnalyze = ' + this.hostToAnalyze);
  intervalObj = setInterval(this.pollAnalyzeRequest.bind(this), ANALYZE_POLL_INTERVAL);
};


SslLabsApi.prototype.getEndpointIpAddr = function getEndpointIpAddr(data) {
  return data.endpoints[0].ipAddress;
};


module.exports = SslLabsApi;

/*
 *  Opensubtitles plugin for Movian Media Center
 *
 *  Copyright (C) 2013-2015 Andreas Öman
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var settings = require('showtime/settings');
var subtitles = require('showtime/subtitles');
var xmlrpc = require('showtime/xmlrpc');
var popup = require('native/popup');
var http = require('movian/http');
var APIURL = "https://api.opensubtitles.com/api/v1/";
var string = require('native/string');
var io = require('native/io');
var token = null;
var username = '';
var password = '';
var apikey = '';

var logo = Plugin.path + "logo.jpg";

function trace(str) {
  console.log(str, 'opensubtitles');
}

var sg = new settings.globalSettings("opensubtitles",
                                     "Opensubtitles",
                                     logo,
                                     "Login details for opensubtitles");

sg.createString("username", "username (dont fill if using api key)", "", function(v) {
  username = v;
  token = null;
});

sg.createString("password", "password", "", function(v) {
  password = v;
  token = null;
});
sg.createString("apikey", "apikey from opensubtitles.com", "", function(v) {
  apikey = v;
  token = null;
});

function getsubtitle(id){

  var r = [];
    
    try {
      var r = JSON.parse(http.request(APIURL +'download', { 
    
      method: "POST",
         //debug: service.debug,
         headers: { 'User-Agent' : "Movian Android 7.0.23", 'Connection': 'keep-alive',
        'Content-Type': ' application/json',
        'Accept':  'application/json',
       // 'Authorization': 'Bearer '+token, to be use if username password are being used
        'Api-Key': apikey

      },
      postdata: JSON.stringify({"file_id":id})
   }))
    } catch(err) {
      trace("Cannot send login to opensubtitles: " + err);

    //  if(force) popup.notify('Opensubtitles login failed: ' + err, 5, logo);
       
      return;
    }

    var url = r.link;
    //console.log(url)
    return url;
}

function login(force) {

  if(token === null || force) {
    trace('Attempting to login as: ' + (username ? username : 'Anonymous'));

    var r = [];
    
    try {
      var r = JSON.parse(http.request(APIURL +'login', { 
    
      method: "POST",
         //debug: service.debug,
         headers: { 'User-Agent' : "Movian Android 7.0.23", 'Connection': 'keep-alive',
        'Content-Type': ' application/json',
        'Accept':  'application/json',
        'Api-Key': apikey

      },
      postdata:  JSON.stringify({"username":username,"password":password})
   }))
    } catch(err) {
      trace("Cannot send login to opensubtitles: " + err);

      if(force)
        popup.notify('Opensubtitles login failed: ' + err, 5, logo);
      return;
    }
 
    if(r.status == 200) {
      token = r.token;
      trace('Login OK');
    } else {
      token = null;
      trace('Login failed: ' + r.status);
      if(force)
        popup.notify('Opensubtitles login failed: ' + r.status, 5, logo);
    }
  }
}


new subtitles.addProvider(function(req) {
  console.log(req.imdb)
  var queries = [];

  if(req.duration < 5 * 60)
    return; // Don't query about clips shorter than 5 minutes

  // Get list of user preferred languages for subs
  var lang = subtitles.getLanguages().join(',');
  //var lang = 'en';
  // Build a opensubtitle query based on request from Movian

  if(req.filesize > 0 && req.opensubhash !== undefined) {

    queries.push({
      sublanguageid: lang,
      moviehash: req.opensubhash,
      moviebytesize: req.filesize.toString()
    });
  }
  if(req.imdb && req.imdb.indexOf('tt') == 0) {
    queries.push({
      sublanguageid: lang,
      imdb_id: req.imdb.substring(2)
      
    });
  } else if(req.title) {

    queries.push({

      
      sublanguageid: lang,
      query: req.title.replace(/\s+/g, "+"),
      season_number: req.season,
      episode_number: req.episode
    
    });
  }

  // Loop so we can retry once (relogin) if something fails
  // This typically happens if the token times out

  for(var retry = 0; retry < 2; retry++) {
   // login(retry); we are using hardcode api and dont know how to get api key from url hence skipping 
    //trace(token)

    var r = [];
    try {
      var r = JSON.parse(http.request(APIURL +'subtitles', { 
        args: queries,
          method: "GET",
         //debug: service.debug,
         headers: { 'User-Agent' : "Movian Android 7.0.23", 'Connection': 'keep-alive',
        'Content-Type': ' application/json',
        'Accept':  'application/json',
        'Api-Key': apikey

      },
   
   }))
    } catch(err) {
      trace("Cannot send search query to opensubtitles: " + err);
      return;
    }

    
      var set = {}; // We can get same subtitle multiple times, so keep track
      var cnt = 0;
      var len = r.data.length;
      for(var i = 0; i < len; i++) {
	var sub = r.data[i];
 // console.log (sub.attributes.language)
	var url = sub.attributes.files[0].file_id;
  //console.log (sub.attributes.files[0].file_id)

	if(url in set)
	  continue;

	set[url] = true;

	var score = 0;
	 if (sub.moviehash_match == 'true')
	 score++; // matches by file hash is better

       // if ((req.season == sub.attributes.season_number) && (req.episode == attributes.episode_number)) score += 2; // matches by season and episode is even better
       

       // var localurl = "opensubtitlefs://" + url.replace(/\/sid-[^\/]+\//, '/__SID_TOKEN__/')
        var localurl = "opensubtitlefs://" + url

	req.addSubtitle(localurl, sub.attributes.files[0].file_name, sub.attributes.language,
			'srt',
			'opensubtitles (' + sub.attributes.language + ')',
			score);
	cnt++;
      }
      trace('Added ' + cnt + ' subtitles');

      return;
 
    
    
    
   
  }
});



var fap = require('native/faprovider');

fap.register('opensubtitlefs', {

  redirect: function(handle, url) {
    //console.log("Redirect: " + url);

    for(var retry = 0; retry < 2; retry++) {
      // Verify that our token is still valid
     // login(retry);
      fap.redirectRespond(handle, true, getsubtitle(url)); 
      
    }
    fap.redirectRespond(handle, false, 'Unable to access opensubtitles');
  }
});

/*
 *  Opensubtitles plugin for Movian Media Center
 *
 *  Copyright (C) 2013-2024 Andreas Öman
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
var store = require('movian/store');
var cred  = store.create('cred', true);
if (!cred.apikey) cred.apikey = null;




var token = null;
var username = '';
var password = '';

var logo = Plugin.path + "logo.jpg";

function trace(str) {
  console.log(str, 'opensubtitles');
}

var sg = new settings.globalSettings("opensubtitles",
                                     "Opensubtitles",
                                     logo,
                                     "Login details for opensubtitles");

sg.createString("username", "username", "", function(v) {
  username = v;
  
});

sg.createString("password", "password", "", function(v) {
  password = v;
  
});


function getsubtitle(id){

  var r = [];
    
    try {
      var r = JSON.parse(http.request(APIURL +'download', { 
    
      method: "POST",
         headers: { 'User-Agent' : "Movian Android 7.0.23", 'Connection': 'keep-alive',
        'Content-Type': ' application/json',
        'Accept':  'application/json',
        'Api-Key': cred.apikey

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

  if(cred.apikey === null || force) {
    trace('Attempting to login as: ' + (username ? username : 'Anonymous'));

            setcookie()
            authenticitytoken()
            signin()
  }
}

new subtitles.addProvider(function(req) {
 // console.log(req.imdb)
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
    login(retry);// we are using hardcode api and dont know how to get api key from url hence skipping 
   // trace(cred.api)

    var r = [];
    try {
      var r = JSON.parse(http.request(APIURL +'subtitles', { 
        args: queries,
          method: "GET",
         //debug: service.debug,
         headers: { 'User-Agent' : "Movian Android 7.0.23", 'Connection': 'keep-alive',
        'Content-Type': ' application/json',
        'Accept':  'application/json',
        'Api-Key': cred.apikey

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

function setcookie (){


  var c = http.request('https://www.opensubtitles.com/en/users/sign_in', { 
          method: "GET",
      headers: { 
   'Host': 'www.opensubtitles.com',
   'Connection': 'keep-alive',
   'Turbolinks-Referrer': 'https://www.opensubtitles.com/?locale=en',
   'sec-ch-ua-mobile': '?0',
   'Sec-Fetch-Site': 'same-origin',
   'Sec-Fetch-Mode': 'cors',
   'Sec-Fetch-Dest': 'empty',
   'Referer': 'https://www.opensubtitles.com/?locale=en',
   'Accept-Language': 'en-US,en;q=0.9'},
 })   



}
function authenticitytoken (){
      
    
  
          var r =JSON.parse(http.request('https://www.opensubtitles.com/en/ujs.json', { 
           
              method: "GET",
             //debug: service.debug,
             headers: { 

             'Host': 'www.opensubtitles.com',
             'Connection': 'keep-alive',
             'Turbolinks-Referrer': 'https://www.opensubtitles.com/en/users/sign_in',
             'sec-ch-ua-mobile': '?0',
             'Sec-Fetch-Site': 'same-origin',
             'Sec-Fetch-Mode': 'cors',
             'Sec-Fetch-Dest': 'empty',
             'Referer': 'https://www.opensubtitles.com/en/users/sign_in',
             'Accept-Language': 'en-US,en;q=0.9'},
         })
       )

            authtoken = r.token
      //  console.log (r)  
        }

    function signin (){
            var pdata = ('utf8=✓&authenticity_token='+authtoken+'&user[login]='+username+'&user[password]='+password+'&user[remember_me]=0&commit=Log-In&current_path=')
        var r = (http.request('https://www.opensubtitles.com/en/users/sign_in ', { 
    
            method: "POST",
               //debug: service.debug,
               headers: { 'User-Agent' : "Movian Android 7.0.23", 
               'Connection': 'keep-alive',
              'Content-Type': ' application/x-www-form-urlencoded',
              'Origin': 'https://www.opensubtitles.com',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'Referer': 'https://www.opensubtitles.com/en/users/sign_in',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9'

              
      
            },

            
            postdata: pdata
         }))
    
       
   
         //authenticitytoken()

         getapikey()
    }

function getapikey () {
        var d = http.request("https://www.opensubtitles.com/en/consumers", { }).toString();
        var  re = /<td\b[^>]*>(.*?)<\/td>/gm
        var matches = [];
        var match;
        
        while ((match = re.exec(d)) !== null) {
          matches.push(match[0]); // Add the matched substring to the array
        }
        
        var apkey = matches[2]
        var apkey = apkey.replace("<td>", "")
        var apkey = apkey.replace("</td>", "")
        cred.apikey = apkey;
        popup.notify('Opensubtitles api key: ' + cred.apikey, 5, logo);
       // console.log (apkey);
    }
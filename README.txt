BEGOTTEN: LEMEGETON - connection loading screen
================================================

What this is
------------
The screen Garry's Mod shows while a player connects to the server and downloads its files (before the
"Initializing Begotten: Lemegeton..." screen and the main menu cinematic). Garry's Mod draws that screen
with its own web browser, before any of the gamemode's Lua runs, so it cannot be made from the schema: it
has to be a web page at a public address, which the server names with the console variable sv_loadingurl.

Files
-----
  index.html          the page
  css/loading.css     layout (scales with the window: every size follows the window height)
  js/loading.js       the scene (one canvas), scripture, status, optional sound
  img/seal.png        the Lemegeton seal (from the supplied seal image)
  img/logo.png        the BEGOTTEN LEMEGETON emblem (from the supplied image)

Nothing is loaded from anywhere else and nothing comes from the game, so the page works before a single
game file has downloaded. Total size is about 0.1 MB. It is written for both of Garry's Mod's browsers
(plain older JavaScript for the default branch's Awesomium, and Chromium on the x86-64 branch). It has been
checked in Chrome; check it once inside the game as well (step 3 below).

What it shows
-------------
Near-black, a red breath behind the Seal of Solomon (it turns once every five minutes), a ring of Latin
turning the other way, fog in two layers, falling ash and a few embers, grain and a heavy vignette. A verse
of scripture (King James / Vulgate) changes every eleven seconds. At the bottom: what the connection is
doing ("Gathering the relics", "The rite begins"...), a thin red thread that fills as files arrive, and the
file being downloaded; the server name and the map sit in the lower corners. Every movement is continuous
(nothing restarts), so it holds for as long as the connection takes. No flashing.

Sound (optional): a quiet drone made in the browser (no audio file) with a distant toll now and then. It
follows the player's game volume. If the browser blocks sound until the player clicks or presses a key, it
starts then. The small note in the top right corner switches it off and on (remembered on that computer).

Preview: open index.html?demo=1 in any browser to see it with a pretend download.

Putting it on the server
------------------------
1. Host the folder somewhere public over https. Any static web host works. For example, GitHub Pages:
     a. Create a new public repository on github.com (for example "lemegeton-loading").
     b. Upload the contents of this folder (index.html, css, js, img) to the repository's root.
     c. In the repository: Settings > Pages > "Deploy from a branch", branch main, folder / (root). Save.
     d. After a minute the page is at  https://<your-github-name>.github.io/lemegeton-loading/
        Open that address in a browser to check it (add ?demo=1 to see the progress bar move).
   Your own web server or any static host is fine too, as long as players can reach the address.

2. Tell the server to use it. Add this line to the server's cfg/server.cfg
   (C:\Server\steamapps\common\GarrysModDS\garrysmod\cfg\server.cfg), with your own address:

     sv_loadingurl "https://<your-github-name>.github.io/lemegeton-loading/index.html"

   Or put  +sv_loadingurl "https://..."  on the server's start command line. Restart the server (or run the
   line in the server console). If your host gives you a control panel instead of files, sv_loadingurl is the
   setting to fill in there.

3. Connect from a client to check. A player who has the server's files already sees the screen only briefly;
   a first-time player sees it for the whole download.

Notes
-----
* Garry's Mod can add the player's details to the address: in sv_loadingurl, %s is replaced by the player's
  SteamID64 and %m by the map name. The page does not need them.
* The page asks the game for nothing and sends nothing anywhere.
* To change the verses, edit the VERSES list in js/loading.js; for the Latin ring, RING_PHRASES.

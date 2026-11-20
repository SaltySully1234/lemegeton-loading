/*
	BEGOTTEN: LEMEGETON - connection screen (sv_loadingurl).

	The scene is one canvas at reduced resolution (stretched to the window), drawn about 30 times a second:
	near-black, a slow red breath behind the Seal of Solomon turning once every five minutes, a ring of Latin
	turning the other way, fog drifting in two layers, ash falling and a few embers rising, grain and a heavy
	vignette. Every movement is continuous, so it loops for as long as the connection takes, without a seam.
	Scripture changes every eleven seconds; the status line follows Garry's Mod's own loading callbacks.

	Optional sound: a quiet drone made in the browser (no audio file), started when the browser allows it
	(otherwise on the first click or key), switched off and on with the note in the top right corner.

	Plain ES5 for both of Garry's Mod's browsers (the old Awesomium of the default branch and Chromium).
	index.html?demo=1 fakes a download, to preview the page in an ordinary browser.
*/

(function () {
	"use strict";

	var doc = document, win = window;
	var canvas = doc.getElementById("scene");
	var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
	var raf = win.requestAnimationFrame || win.webkitRequestAnimationFrame || function (cb) {
		return win.setTimeout(function () { cb(); }, 33);
	};

	var SCALE = 0.5;           // canvas pixels per window pixel (the scene is soft; text stays sharp in the page)
	var FRAME_MS = 32;         // about 30 frames a second is plenty for this much movement
	var W = 0, H = 0, CW = 0, CH = 0;
	var startT = now(), lastDraw = 0;

	function now() {
		return (win.performance && win.performance.now) ? win.performance.now() : new Date().getTime();
	}

	function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

	function makeCanvas(w, h) {
		var c = doc.createElement("canvas");

		c.width = w;
		c.height = h;

		return c;
	}

	// Seeded random, so the fog tiles and particles look the same on every visit.
	var seed = 1337;

	function rnd() {
		seed = (seed * 16807) % 2147483647;

		return (seed - 1) / 2147483646;
	}

	/* ---------------------------------------------------------------------------------------------- Images */

	var sealImg = new Image(), logoImg = doc.getElementById("logo");
	var sealReady = false, sealGlow = null;

	sealImg.onload = function () {
		sealReady = true;
		sealGlow = buildGlow(sealImg);
	};
	sealImg.src = "img/seal.png";

	if (logoImg) {
		var showLogo = function () { logoImg.style.opacity = "0.92"; };

		if (logoImg.complete) { win.setTimeout(showLogo, 400); } else { logoImg.onload = showLogo; }
	}

	// A soft red halo around the seal, made once (blurring every frame would be far too costly).
	function buildGlow(img) {
		var size = 384, pad = 64, c = makeCanvas(size + pad * 2, size + pad * 2), g = c.getContext("2d");

		g.shadowColor = "rgba(150, 10, 4, 1)";
		g.shadowBlur = 36;
		g.globalAlpha = 0.9;
		g.drawImage(img, pad, pad, size, size);
		g.shadowBlur = 0;

		return {canvas: c, scale: (size + pad * 2) / size};
	}

	/* ---------------------------------------------------------------------------------------- Fog tiles */

	// Tileable value noise: a periodic lattice, smoothly interpolated, a few octaves summed.
	function noiseTile(size, period, octaves, r, g, b, alpha) {
		var c = makeCanvas(size, size), t = c.getContext("2d");
		var img = t.createImageData(size, size), d = img.data;
		var lattices = [], o, i, x, y;

		for (o = 0; o < octaves; o++) {
			var p = period * Math.pow(2, o), lat = [];

			for (i = 0; i < p * p; i++) { lat.push(rnd()); }

			lattices.push({p: p, v: lat});
		}

		function smooth(f) { return f * f * (3 - 2 * f); }

		for (y = 0; y < size; y++) {
			for (x = 0; x < size; x++) {
				var sum = 0, amp = 1, norm = 0;

				for (o = 0; o < octaves; o++) {
					var L = lattices[o], P = L.p;
					var fx = x / size * P, fy = y / size * P;
					var x0 = Math.floor(fx), y0 = Math.floor(fy);
					var tx = smooth(fx - x0), ty = smooth(fy - y0);
					var x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
					var a = L.v[y0 * P + x0], bb = L.v[y0 * P + x1], cc = L.v[y1 * P + x0], dd = L.v[y1 * P + x1];
					var top = a + (bb - a) * tx, bot = cc + (dd - cc) * tx;

					sum += (top + (bot - top) * ty) * amp;
					norm += amp;
					amp *= 0.5;
				}

				var v = sum / norm, k = (y * size + x) * 4;
				var dens = clamp((v - 0.42) * 2.4, 0, 1);

				d[k] = r;
				d[k + 1] = g;
				d[k + 2] = b;
				d[k + 3] = Math.floor(dens * dens * alpha);
			}
		}

		t.putImageData(img, 0, 0);

		return c;
	}

	var fogA = null, fogB = null, grain = null, grainPattern = null;

	function buildTextures() {
		fogA = noiseTile(192, 4, 3, 70, 46, 40, 200);
		fogB = noiseTile(160, 3, 3, 58, 24, 20, 170);

		grain = makeCanvas(96, 96);

		var g = grain.getContext("2d"), img = g.createImageData(96, 96), d = img.data, i;

		for (i = 0; i < d.length; i += 4) {
			var v = Math.floor(rnd() * 255);

			d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 38;
		}

		g.putImageData(img, 0, 0);

		if (ctx) { grainPattern = ctx.createPattern(grain, "repeat"); }
	}

	/* ------------------------------------------------------------------------------------ Latin ring */

	var RING_PHRASES = ["CLAVICULA SALOMONIS", "ARS GOETIA", "DE PROFUNDIS CLAMAVI AD TE DOMINE", "LIBER DAMNATORUM", "SIGILLUM SECRETUM"];
	var RING_SEP = " \u2720 ";
	var ring = null;

	function buildRing() {
		var R = Math.max(40, Math.round(CH * 0.285)), fs = Math.max(6, Math.round(CH * 0.024));
		var size = (R + fs * 2) * 2, c = makeCanvas(size, size), g = c.getContext("2d");
		var circ = 2 * Math.PI * R, text = "", i, total = 0, widths = [];

		g.font = fs + "px \"Times New Roman\", Georgia, serif";

		// Whole phrases only, as many as go round; the letters are then spaced out to close the circle exactly.
		for (i = 0; i < 60; i++) {
			var next = text + RING_PHRASES[i % RING_PHRASES.length] + RING_SEP;

			if (text !== "" && g.measureText(next).width > circ * 0.985) { break; }

			text = next;
		}

		for (i = 0; i < text.length; i++) { widths.push(g.measureText(text.charAt(i)).width); }

		total = 0;

		for (i = 0; i < widths.length; i++) { total += widths[i]; }

		var extra = (circ - total) / Math.max(1, text.length), acc = 0;

		g.fillStyle = "rgba(150, 120, 95, 1)";
		g.textAlign = "center";
		g.textBaseline = "middle";

		for (i = 0; i < text.length; i++) {
			var ang = (acc + widths[i] / 2) / R - Math.PI / 2;

			g.save();
			g.translate(size / 2 + Math.cos(ang) * R, size / 2 + Math.sin(ang) * R);
			g.rotate(ang + Math.PI / 2);
			g.fillText(text.charAt(i), 0, 0);
			g.restore();

			acc += widths[i] + extra;
		}

		ring = c;
	}

	/* -------------------------------------------------------------------------------------- Vignette */

	var vignette = null;

	function buildVignette() {
		vignette = makeCanvas(CW, CH);

		var g = vignette.getContext("2d");
		var r = Math.sqrt(CW * CW + CH * CH) * 0.55;
		var grad = g.createRadialGradient(CW / 2, CH * 0.52, r * 0.22, CW / 2, CH * 0.52, r);

		grad.addColorStop(0, "rgba(0, 0, 0, 0)");
		grad.addColorStop(0.55, "rgba(0, 0, 0, 0.45)");
		grad.addColorStop(1, "rgba(0, 0, 0, 0.94)");
		g.fillStyle = grad;
		g.fillRect(0, 0, CW, CH);
	}

	/* ------------------------------------------------------------------------------------- Particles */

	var motes = [];

	function buildMotes() {
		motes = [];

		for (var i = 0; i < 46; i++) {
			var ember = i < 10;

			motes.push({
				ember: ember,
				x: rnd(), y: rnd(),
				vy: ember ? -(0.010 + rnd() * 0.018) : (0.006 + rnd() * 0.012),
				vx: (rnd() - 0.5) * 0.006,
				sway: rnd() * 6.28, swayF: 0.3 + rnd() * 0.6,
				size: ember ? (1 + rnd() * 1.2) : (0.8 + rnd() * 1.6),
				a: ember ? (0.5 + rnd() * 0.5) : (0.15 + rnd() * 0.3),
				flick: rnd() * 6.28
			});
		}
	}

	/* ------------------------------------------------------------------------------------------ Frame */

	function resize() {
		W = win.innerWidth || doc.documentElement.clientWidth || 1280;
		H = win.innerHeight || doc.documentElement.clientHeight || 720;

		// 1rem = 1/54 of the height: every size in the page follows the window.
		doc.documentElement.style.fontSize = Math.max(8, H / 54) + "px";

		if (!ctx) { return; }

		CW = Math.max(320, Math.round(W * SCALE));
		CH = Math.max(180, Math.round(H * SCALE));
		canvas.width = CW;
		canvas.height = CH;

		buildRing();
		buildVignette();
	}

	function tileFill(img, ox, oy, scale, alpha) {
		var tw = img.width * scale, th = img.height * scale;
		var x0 = -(((ox % tw) + tw) % tw), y0 = -(((oy % th) + th) % th), x, y;

		ctx.globalAlpha = alpha;

		for (y = y0; y < CH; y += th) {
			for (x = x0; x < CW; x += tw) {
				ctx.drawImage(img, x, y, tw + 1, th + 1);
			}
		}

		ctx.globalAlpha = 1;
	}

	function draw(t) {
		var cx = CW / 2, cy = CH * 0.515;
		var breath = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 14);           // 14 s breath
		var slow = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 37 + 1.3);       // a slower swell under it

		// Ink.
		ctx.globalCompositeOperation = "source-over";
		ctx.fillStyle = "#040202";
		ctx.fillRect(0, 0, CW, CH);

		// A red breath behind the seal.
		var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, CH * (0.55 + 0.05 * slow));

		gr.addColorStop(0, "rgba(" + Math.round(52 + 26 * breath) + ", 4, 2, 1)");
		gr.addColorStop(0.45, "rgba(24, 2, 1, 0.9)");
		gr.addColorStop(1, "rgba(4, 2, 2, 0)");
		ctx.fillStyle = gr;
		ctx.fillRect(0, 0, CW, CH);

		// Far fog, drifting left.
		var fs = CH / 160;

		if (fogB) { tileFill(fogB, t * 4.2 * fs, t * 0.6 * fs, fs * 2.2, 0.55); }

		// The seal: its halo breathing, the seal itself turning once every five minutes.
		var sealSize = CH * 0.44, rot = t * 2 * Math.PI / 300;

		if (sealReady) {
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(rot);

			if (sealGlow) {
				var gs = sealSize * sealGlow.scale;

				ctx.globalAlpha = 0.22 + 0.28 * breath;
				ctx.drawImage(sealGlow.canvas, -gs / 2, -gs / 2, gs, gs);
			}

			ctx.globalAlpha = 0.5 + 0.18 * breath;
			ctx.drawImage(sealImg, -sealSize / 2, -sealSize / 2, sealSize, sealSize);
			ctx.restore();
			ctx.globalAlpha = 1;
		}

		// The Latin ring, turning the other way, barely there.
		if (ring) {
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(-t * 2 * Math.PI / 420);
			ctx.globalAlpha = 0.16 + 0.1 * slow;
			ctx.drawImage(ring, -ring.width / 2, -ring.height / 2);
			ctx.restore();
			ctx.globalAlpha = 1;
		}

		// Near fog, drifting right, over the seal.
		if (fogA) { tileFill(fogA, -t * 7.5 * fs, -t * 1.1 * fs, fs * 3.1, 0.42 + 0.12 * slow); }

		// Ash falling, embers rising.
		var dt = Math.min(0.1, (t - (draw.lastT || t)));

		draw.lastT = t;

		for (var i = 0; i < motes.length; i++) {
			var m = motes[i];

			m.y += m.vy * dt;
			m.x += (m.vx + Math.sin(t * m.swayF + m.sway) * 0.004) * dt;

			if (m.y < -0.02) { m.y = 1.02; m.x = rnd(); }
			if (m.y > 1.02) { m.y = -0.02; m.x = rnd(); }
			if (m.x < -0.02) { m.x = 1.02; }
			if (m.x > 1.02) { m.x = -0.02; }

			if (m.ember) {
				var f = 0.55 + 0.45 * Math.sin(t * 7 + m.flick);

				ctx.fillStyle = "rgba(255, " + Math.round(90 + 60 * f) + ", 30, " + (m.a * f).toFixed(3) + ")";
			} else {
				ctx.fillStyle = "rgba(150, 140, 130, " + m.a.toFixed(3) + ")";
			}

			ctx.fillRect(m.x * CW, m.y * CH, m.size, m.size);
		}

		// Grain, a fresh offset each frame.
		if (grainPattern) {
			ctx.save();
			ctx.translate(-Math.floor(rnd() * 96), -Math.floor(rnd() * 96));
			ctx.globalAlpha = 0.55;
			ctx.fillStyle = grainPattern;
			ctx.fillRect(0, 0, CW + 96, CH + 96);
			ctx.restore();
			ctx.globalAlpha = 1;
		}

		// Vignette.
		if (vignette) { ctx.drawImage(vignette, 0, 0); }
	}

	function loop() {
		var n = now();

		if (n - lastDraw >= FRAME_MS - 2) {
			lastDraw = n;

			try { draw((n - startT) / 1000); } catch (e) { /* never let a drawing error stop the page */ }

			// The emblem breathes very slightly with the seal.
			if (logoImg && logoImg.style.opacity !== "0" && logoImg.style.opacity !== "") {
				var b = 0.5 + 0.5 * Math.sin(((n - startT) / 1000) * 2 * Math.PI / 14);

				logoImg.style.opacity = (0.84 + 0.1 * b).toFixed(3);
			}
		}

		raf(loop);
	}

	/* ---------------------------------------------------------------------------------------- Scripture */

	var VERSES = [
		["Out of the depths have I cried unto thee, O LORD.", "Psalm 130:1"],
		["And I looked, and behold a pale horse: and his name that sat on him was Death, and Hell followed with him.", "Revelation 6:8"],
		["And the smoke of their torment ascendeth up for ever and ever.", "Revelation 14:11"],
		["The heart is deceitful above all things, and desperately wicked.", "Jeremiah 17:9"],
		["And in those days shall men seek death, and shall not find it.", "Revelation 9:6"],
		["Wide is the gate, and broad is the way, that leadeth to destruction.", "Matthew 7:13"],
		["For the wages of sin is death.", "Romans 6:23"],
		["And the sea gave up the dead which were in it; and death and hell delivered up the dead which were in them.", "Revelation 20:13"],
		["De profundis clamavi ad te, Domine.", "Psalmus CXXIX"]
	];
	var verseEl = doc.getElementById("verse"), verseText = doc.getElementById("verse-text"), verseRef = doc.getElementById("verse-ref");
	var verseIdx = Math.floor(rnd() * VERSES.length);

	function nextVerse() {
		if (!verseEl) { return; }

		verseEl.style.opacity = "0";

		win.setTimeout(function () {
			var v = VERSES[verseIdx % VERSES.length];

			verseIdx += 1;
			verseText.innerHTML = "";
			verseText.appendChild(doc.createTextNode("\u201C" + v[0] + "\u201D"));
			verseRef.innerHTML = "";
			verseRef.appendChild(doc.createTextNode(v[1]));
			verseEl.style.opacity = "1";
		}, 2700);
	}

	/* ------------------------------------------------------------------------------- Loading status */

	var statusWord = doc.getElementById("status-word"), statusDetail = doc.getElementById("status-detail");
	var thread = doc.getElementById("thread"), threadFill = doc.getElementById("thread-fill");
	var serverEl = doc.getElementById("server"), mapEl = doc.getElementById("map");
	var filesTotal = 0, filesNeeded = 0, volume = 1;

	function setText(el, text) {
		if (!el) { return; }

		el.innerHTML = "";
		el.appendChild(doc.createTextNode(text || ""));
	}

	function setWord(text) { setText(statusWord, text); }

	function updateThread() {
		if (!thread || filesTotal <= 0) { return; }

		var done = clamp((filesTotal - filesNeeded) / filesTotal, 0, 1);

		thread.className = "known";
		threadFill.style.width = (done * 100).toFixed(1) + "%";
	}

	// Garry's Mod calls these while the player connects.
	win.GameDetails = function (servername, serverurl, mapname, maxplayers, steamid, gamemode, vol) {
		setText(serverEl, servername);
		setText(mapEl, mapname);

		var v = parseFloat(vol);

		if (!isNaN(v)) {
			volume = clamp(v, 0, 1);
			Drone.setVolume(volume);
		}
	};

	win.SetFilesTotal = function (total) {
		filesTotal = parseInt(total, 10) || 0;
		updateThread();
	};

	win.SetFilesNeeded = function (needed) {
		filesNeeded = parseInt(needed, 10) || 0;
		updateThread();
	};

	win.DownloadingFile = function (fileName) {
		setWord("Gathering the relics");
		setText(statusDetail, fileName);
	};

	win.SetStatusChanged = function (status) {
		var s = String(status || ""), lower = s.toLowerCase();

		if (lower.indexOf("lua") >= 0 || lower.indexOf("starting") >= 0) {
			setWord("The rite begins");
		} else if (lower.indexOf("workshop") >= 0 || lower.indexOf("addon") >= 0 || lower.indexOf("mount") >= 0) {
			setWord("Unearthing the vaults");
		} else if (lower.indexOf("download") >= 0) {
			setWord("Gathering the relics");
		} else if (lower.indexOf("sending") >= 0 || lower.indexOf("client info") >= 0) {
			setWord("Your name is written");
		} else {
			setWord("Descending into Lemegeton");
		}

		setText(statusDetail, s);
	};

	/* ---------------------------------------------------------------------------------------- Sound */

	// A drone made here (two low tones a hair apart, a fifth above them, wind) and now and then a distant toll.
	// Old and new Web Audio both: createGain/createGainNode, start/noteOn, string or numeric filter types.
	var Drone = (function () {
		var AC = win.AudioContext || win.webkitAudioContext;
		var ac = null, master = null, running = false, muted = false, wanted = 1, tollTimer = null;
		var soundEl = doc.getElementById("sound");

		function gainNode() { return ac.createGain ? ac.createGain() : ac.createGainNode(); }
		function start(node, when) { if (node.start) { node.start(when || 0); } else { node.noteOn(when || 0); } }
		function stop(node, when) { try { if (node.stop) { node.stop(when || 0); } else { node.noteOff(when || 0); } } catch (e) {} }
		function filterType(f, name, num) { try { f.type = name; } catch (e) { f.type = num; } if (f.type !== name && typeof f.type === "number") { f.type = num; } }

		try { muted = win.localStorage && win.localStorage.getItem("lemLoadingMuted") === "1"; } catch (e) { muted = false; }

		function level() { return muted ? 0 : 0.16 * wanted; }

		function showButton() {
			if (!soundEl) { return; }

			soundEl.style.display = "block";
			soundEl.innerHTML = muted ? "&#9834; off" : "&#9834;";
		}

		function build() {
			ac = new AC();
			master = gainNode();
			master.gain.value = 0;
			master.connect(ac.destination);

			var low = ac.createBiquadFilter();

			filterType(low, "lowpass", 0);
			low.frequency.value = 420;
			low.connect(master);

			var tones = [[55, 0.30], [55.35, 0.26], [82.4, 0.10], [110.2, 0.05]];

			for (var i = 0; i < tones.length; i++) {
				var o = ac.createOscillator(), g = gainNode();

				o.frequency.value = tones[i][0];
				g.gain.value = tones[i][1];
				o.connect(g);
				g.connect(low);
				start(o);
			}

			// Wind: looping noise through a slowly wandering band-pass.
			var len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0), last = 0;

			for (var k = 0; k < len; k++) {
				last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
				data[k] = last * 3;
			}

			var src = ac.createBufferSource(), band = ac.createBiquadFilter(), wg = gainNode();

			src.buffer = buf;
			src.loop = true;
			filterType(band, "bandpass", 2);
			band.frequency.value = 300;
			band.Q.value = 0.7;
			wg.gain.value = 0.55;
			src.connect(band);
			band.connect(wg);
			wg.connect(master);
			start(src);

			var lfo = ac.createOscillator(), lg = gainNode();

			lfo.frequency.value = 0.045;
			lg.gain.value = 160;
			lfo.connect(lg);
			lg.connect(band.frequency);
			start(lfo);
		}

		// A distant toll every 11 to 19 seconds: a low bell partial fading over six seconds.
		function toll() {
			if (!ac || !running) { return; }

			var notes = [146.8, 174.6, 196, 220], f = notes[Math.floor(Math.random() * notes.length)];
			var t0 = ac.currentTime + 0.05, parts = [[1, 0.5], [2.76, 0.12], [5.4, 0.04]];

			for (var i = 0; i < parts.length; i++) {
				var o = ac.createOscillator(), g = gainNode();

				o.frequency.value = f * parts[i][0];
				g.gain.value = 0;
				o.connect(g);
				g.connect(master);

				if (g.gain.setValueAtTime) {
					g.gain.setValueAtTime(0, t0);
					g.gain.linearRampToValueAtTime(parts[i][1], t0 + 0.04);
					g.gain.exponentialRampToValueAtTime(0.0008, t0 + 6);
				}

				start(o, t0);
				stop(o, t0 + 6.2);
			}

			tollTimer = win.setTimeout(toll, 11000 + Math.random() * 8000);
		}

		function fadeTo(v, seconds) {
			if (!master) { return; }

			var g = master.gain, t = ac.currentTime;

			if (g.setValueAtTime && g.linearRampToValueAtTime) {
				if (g.cancelScheduledValues) { g.cancelScheduledValues(t); }

				g.setValueAtTime(g.value, t);
				g.linearRampToValueAtTime(v, t + seconds);
			} else {
				g.value = v;
			}
		}

		function begin() {
			if (!AC) { return; }

			try {
				if (!ac) { build(); }

				if (ac.state === "suspended" && ac.resume) { ac.resume(); }

				if (ac.state === "suspended") { return; }

				if (!running) {
					running = true;
					fadeTo(level(), 6);
					tollTimer = win.setTimeout(toll, 7000);
				}
			} catch (e) {
				ac = null;
			}
		}

		// The browser may only allow sound after a click or key.
		function onInput() {
			begin();

			if (running) {
				doc.removeEventListener("mousedown", onInput, true);
				doc.removeEventListener("keydown", onInput, true);
			}
		}

		return {
			init: function () {
				if (!AC) { return; }

				showButton();
				begin();
				doc.addEventListener("mousedown", onInput, true);
				doc.addEventListener("keydown", onInput, true);

				// Some browsers report the context running only after a moment.
				win.setTimeout(begin, 1500);

				if (soundEl) {
					soundEl.onclick = function () {
						muted = !muted;

						try { win.localStorage.setItem("lemLoadingMuted", muted ? "1" : "0"); } catch (e) {}

						begin();
						fadeTo(level(), 1.2);
						showButton();
					};
				}
			},
			setVolume: function (v) {
				wanted = v;

				if (running) { fadeTo(level(), 2); }
			}
		};
	})();

	/* ----------------------------------------------------------------------------------------- Start */

	function demo() {
		// index.html?demo=1: a pretend download, for previewing outside the game.
		win.GameDetails("BEGOTTEN: LEMEGETON", "", "bg_district34", 64, "", "cwbegotten", 0.8, "en");
		win.SetStatusChanged("Retrieving server info...");

		var total = 640, need = total;

		win.setTimeout(function () {
			win.SetFilesTotal(total);

			var tick = win.setInterval(function () {
				need = Math.max(0, need - Math.floor(3 + Math.random() * 9));
				win.SetFilesNeeded(need);
				win.DownloadingFile("materials/begotten/ui/" + ["frame", "seal", "ash", "bone", "relic"][need % 5] + "_" + need + ".vtf");

				if (need === 0) {
					win.clearInterval(tick);
					win.SetStatusChanged("Starting Lua...");
				}
			}, 160);
		}, 2500);
	}

	resize();
	win.onresize = resize;

	if (ctx) {
		buildTextures();
		buildMotes();
		raf(loop);
	}

	nextVerse();
	win.setInterval(nextVerse, 11000);
	Drone.init();

	if (/[?&]demo=1/.test(win.location.search || "")) { demo(); }
})();

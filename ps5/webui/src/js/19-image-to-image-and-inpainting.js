  // ---------- image to image and inpainting ----------
  // st.init: the start image {canvas (at most 4096 px a side), name, mask, painted}. mask is a canvas of
  // the same size, red where painted and clear elsewhere (null: no mask); painted is its painted share.
  // With a mask and "only the masked area", a box around the mask is generated at the model's size and
  // put back into the image here, in the page; otherwise the whole image (cropped to the form's aspect)
  // is the start. A masked result is always blended back over the start image with a soft edge, so the
  // rest of the image stays exactly as it was, and saved to the gallery in place of the raw result.
  // The start image's longest side at most (a phone photo is scaled down): the largest size made
  // is about 1536, and the start image and its two mask layers are canvases of this size, which
  // a phone's browser keeps in a small memory budget (past it, canvases come back empty).
  var INIT_MAX = 2048;
  // layer: 'mask' (what changes) or 'boost' (where Ref Boost applies, Krea2 edits by the prompt)
  var me = { brush: 48, erase: false, down: false, last: null, scale: 1, layer: 'mask' };
  var layerColor = { mask: 'rgb(255,48,48)', boost: 'rgb(48,200,96)' };
  var layerRGB = { mask: [255, 48, 48], boost: [48, 200, 96] };

  function canvasOf(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // w x h with the aspect of the source and about `area` pixels, in steps of 64.
  function fitArea(w, h, area) {
    var k = Math.sqrt(area / (w * h));
    return { w: Math.max(64, Math.round(w * k / 64) * 64), h: Math.max(64, Math.round(h * k / 64) * 64) };
  }

  function setInit(src, name) {
    if (vidStartCapable()) { setVideoStart(src, name); return; }   // a video model that starts from a picture
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var k = Math.min(1, INIT_MAX / Math.max(w, h));
      var c = canvasOf(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      st.init = { canvas: c, name: name || 'image', mask: null, painted: 0 };
      // the size follows the image: its aspect, at the model's usual number of pixels
      var f = fitArea(c.width, c.height, st.preset ? st.preset.w * st.preset.h : 512 * 512);
      $('w').value = f.w;
      $('h').value = f.h;
      markPreset();
      persist();
      setView('create');
      setMode('edit');
      drawInit();
      // masks asked for with "Use its mask" or "Use these settings" before a start image was loaded
      var pending = st.pendingMasks;
      st.pendingMasks = null;
      toast('Start image set; the size is ' + f.w + '×' + f.h + ' now.' +
        (pending ? restoreMasks(pending) : ' Paint a mask to change only a part of it.'), 6000);
    };
    img.onerror = function () { toast('Could not read that image.', 6000); };
    img.src = src;
  }

  function dropInit() {
    st.init = null;
    drawInit();
  }

  function initFile() {
    var input = $('init-file');
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { setInit(r.result, f.name); };
    r.onerror = function () { toast('Could not read ' + f.name + '.', 6000); };
    r.readAsDataURL(f);
  }

  // FLUX.2 and Krea2 edits by the prompt use the start image as a reference.
  function refCapable() { return /^FLUX\.2|^Krea2/.test(loadedFamily()); }
  function refEdit() { return !!st.init && refCapable() && $('init-ref').checked; }
  // A Krea2 edit by the prompt can take a mask too: only the painted part is edited, the rest
  // of the photo stays as it is (the edit starts from the photo, see imageBody).
  function refMaskable() { return /^Krea2/.test(loadedFamily()); }

  function drawInit() {
    var i = st.init, ref = refEdit();
    show('init-box', !!i);
    show('init-bar', !i, 'flex');
    // Show Ref Boost on Create whenever Krea2 is loaded; it is sent only for edits
    // that use a reference image.
    show('ref-boost-row', /^Krea2/.test(loadedFamily()), 'flex');
    show('boost-mask', false);
    if (i) {
      var k = Math.min(1, 240 / Math.max(i.canvas.width, i.canvas.height));
      var t = canvasOf(Math.max(1, Math.round(i.canvas.width * k)), Math.max(1, Math.round(i.canvas.height * k)));
      var g = t.getContext('2d');
      g.drawImage(i.canvas, 0, 0, t.width, t.height);
      if (i.mask) {
        g.globalAlpha = 0.55;
        g.drawImage(i.mask, 0, 0, t.width, t.height);
        g.globalAlpha = 1;
      }
      if (i.boost && ref) {
        g.globalAlpha = 0.55;
        g.drawImage(i.boost, 0, 0, t.width, t.height);
        g.globalAlpha = 1;
      }
      $('init-thumb').src = t.toDataURL('image/png');
      text($('init-meta'), i.canvas.width + '×' + i.canvas.height + ' · ' + (ref && i.mask && refMaskable()
        ? 'a reference, ' + Math.max(1, Math.round(i.painted * 100)) + '% masked: only that part is edited'
        : ref
        ? 'a reference: the prompt says what changes'
        : i.mask ? Math.max(1, Math.round(i.painted * 100)) + '% masked: only that part changes'
        : 'no mask: the whole image changes'));
      text($('init-mask'), i.mask ? 'Edit the mask' : 'Paint a mask');
      show('init-ref-row', refCapable(), 'flex');
      show('init-str-row', !ref, 'flex');
      show('init-mask', !ref || refMaskable(), 'inline-block');
      show('boost-mask', ref && refMaskable(), 'inline-block');
      text($('boost-mask'), i.boost
        ? 'Ref Boost area: ' + Math.max(1, Math.round(i.boostPainted * 100)) + '% (edit)'
        : 'Paint the face (Ref Boost)');
      show('init-crop-row', !!i.mask && !ref, 'flex');
      text($('init-hint'), ref && i.mask && refMaskable()
        ? 'Only the painted part is edited; the rest of the photo stays exactly as it is. Say what to change there, for example "a red bikini".'
        : ref
        ? 'Say what to change, for example "the same house in winter, snow on the roof". The layout and the rest stay. ' +
          'It takes longer than an image of its own: about a minute at 4 steps, two at 8.'
        : i.mask && $('init-crop').checked
        ? 'A box around the mask is made with as many pixels as Width × Height, then put back into the image: small fixes in large images are quick and sharp.'
        : 'Strength 0.3 to 0.5 keeps the picture and changes details; 0.7 and up changes much more.' +
          ($('hr-on').checked ? ' The hires fix is not used with a start image.' : ''));
    }
    summary();
  }

  // ---- the guide image (ControlNet): its edges or pose steer the layout of the new image
  function drawGuide() {
    var g = st.cn;
    show('cn-box', !!g);
    show('cn-bar', !g, 'flex');
    if (g) {
      var k = Math.min(1, 240 / Math.max(g.canvas.width, g.canvas.height));
      var t = canvasOf(Math.max(1, Math.round(g.canvas.width * k)), Math.max(1, Math.round(g.canvas.height * k)));
      t.getContext('2d').drawImage(g.canvas, 0, 0, t.width, t.height);
      $('cn-thumb').src = t.toDataURL('image/png');
      text($('cn-meta'), g.canvas.width + '×' + g.canvas.height + ' · ' + st.cnModel);
    }
    text($('cn-hint'), 'The new image follows the guide\'s layout: its edges with Canny on, the image itself with it off. 0.5 is loose, 1 close.');
    summary();
  }

  // The size of the form stays as it is; the guide is scaled to it when the image is made.
  function setGuide(src, name) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var k = Math.min(1, INIT_MAX / Math.max(w, h));
      var c = canvasOf(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      st.cn = { canvas: c, name: name || 'image' };
      setView('create');
      setMode('guide');
      drawGuide();
      toast(st.cnModel ? 'Guide image set.' : 'Guide image set. It is used with a model that has a ControlNet (Models tab: SDXL + Canny ControlNet).', 6000);
    };
    img.onerror = function () { toast('Could not read that image.', 6000); };
    img.src = src;
  }

  function dropGuide() {
    st.cn = null;
    drawGuide();
  }

  function guideFile() {
    var input = $('cn-file');
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () { setGuide(r.result, f.name); };
    r.onerror = function () { toast('Could not read ' + f.name + '.', 6000); };
    r.readAsDataURL(f);
  }

  // The guide covering w x h: aspect kept, the overflow cut off at the middle; a PNG data URL.
  function guideData(w, h) {
    var g = st.cn.canvas;
    var k = Math.max(w / g.width, h / g.height);
    var dw = g.width * k, dh = g.height * k;
    var c = canvasOf(w, h);
    c.getContext('2d').drawImage(g, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c.toDataURL('image/png');
  }

  // ---- the mask editor
  // Both layers (red: what changes, green: the Ref Boost area) are painted in this one editor
  // for a Krea2 edit by the prompt; otherwise only the red one.
  function bothLayers() { return refEdit() && refMaskable(); }

  function setLayer(layer) {
    var i = st.init;
    me.layer = layer === 'boost' && bothLayers() ? 'boost' : 'mask';
    if (!i[me.layer]) i[me.layer] = canvasOf(i.canvas.width, i.canvas.height);
    text($('me-title'), me.layer === 'boost'
      ? 'Green: the face (Ref Boost pulls the result toward this part of the photo)'
      : 'Red: paint over what should change');
    text($('me-layer'), me.layer === 'boost' ? 'Painting green · switch to red' : 'Painting red · switch to green');
    text($('me-fill'), me.layer === 'boost' ? 'Rest in red' : 'Rest in green');
    $('me-layer').style.borderColor = layerColor[me.layer];
    if ($('me').style.display !== 'none') drawMask();
  }

  function openMask(layer) {
    var i = st.init;
    if (!i) return;
    show('me-layer', bothLayers(), 'inline-block');
    show('me-fill', bothLayers(), 'inline-block');
    me.erase = false;
    text($('me-mode'), 'Erase');
    show('me', true, 'flex');
    setLayer(layer);
    sizeMask();
  }

  // The brush size: the - and + buttons step it by 8, the box takes any size typed (2-400 px).
  function setBrush(v) {
    v = parseInt(v, 10);
    if (isFinite(v)) me.brush = Math.max(2, Math.min(400, v));
    $('me-size').value = me.brush;
  }

  function switchLayer() { setLayer(me.layer === 'boost' ? 'mask' : 'boost'); }

  // The other layer becomes everything this one does not cover: paint the face green, then
  // "Rest in red" makes all the rest the part that changes (and the other way round).
  function fillOther() {
    var i = st.init, other = me.layer === 'boost' ? 'mask' : 'boost';
    var src = i[me.layer], W = src.width, H = src.height;
    if (!i[other]) i[other] = canvasOf(W, H);
    var a = src.getContext('2d').getImageData(0, 0, W, H).data;
    var g = i[other].getContext('2d'), d = g.createImageData(W, H), o = d.data, rgb = layerRGB[other];
    for (var k = 0; k < o.length; k += 4) {
      o[k] = rgb[0]; o[k + 1] = rgb[1]; o[k + 2] = rgb[2]; o[k + 3] = 255 - a[k + 3];
    }
    g.putImageData(d, 0, 0);
    drawMask();
  }

  function sizeMask() {
    var i = st.init, cv = $('me-canvas'), body = $('me-body');
    if (!i || $('me').style.display === 'none') return;
    var bw = Math.max(100, body.clientWidth - 16), bh = Math.max(100, body.clientHeight - 8);
    var k = Math.min(bw / i.canvas.width, bh / i.canvas.height);
    cv.width = Math.max(1, Math.round(i.canvas.width * k));
    cv.height = Math.max(1, Math.round(i.canvas.height * k));
    me.scale = k;
    $('me-size').value = me.brush;
    drawMask();
  }

  function drawMask() {
    var i = st.init, cv = $('me-canvas'), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(i.canvas, 0, 0, cv.width, cv.height);
    var other = me.layer === 'boost' ? 'mask' : 'boost';
    if (bothLayers() && i[other]) {  // the other layer, fainter
      g.globalAlpha = 0.25;
      g.drawImage(i[other], 0, 0, cv.width, cv.height);
    }
    g.globalAlpha = 0.55;
    g.drawImage(i[me.layer], 0, 0, cv.width, cv.height);
    g.globalAlpha = 1;
  }

  function maskPoint(e) {
    var r = $('me-canvas').getBoundingClientRect();
    var t = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: (t.clientX - r.left) / me.scale, y: (t.clientY - r.top) / me.scale };
  }

  function strokeTo(pt) {
    var g = st.init[me.layer].getContext('2d'), a = me.last || pt;
    g.globalCompositeOperation = me.erase ? 'destination-out' : 'source-over';
    g.strokeStyle = layerColor[me.layer];
    g.lineWidth = me.brush / me.scale;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(pt.x + 0.01, pt.y);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    me.last = pt;
    drawMask();
  }

  function maskDown(e) {
    e = e || window.event;
    me.down = true;
    me.last = null;
    strokeTo(maskPoint(e));
    if (e.preventDefault) e.preventDefault();
    return false;
  }

  function maskMove(e) {
    e = e || window.event;
    if (!me.down) return true;
    strokeTo(maskPoint(e));
    if (e.preventDefault) e.preventDefault();
    return false;
  }

  function maskUp() { me.down = false; me.last = null; }

  function invertMask() {
    var m = st.init[me.layer], g = m.getContext('2d'), d = g.getImageData(0, 0, m.width, m.height), a = d.data;
    var rgb = layerRGB[me.layer];
    for (var i = 0; i < a.length; i += 4) {
      a[i] = rgb[0]; a[i + 1] = rgb[1]; a[i + 2] = rgb[2]; a[i + 3] = 255 - a[i + 3];
    }
    g.putImageData(d, 0, 0);
    drawMask();
  }

  function clearMask() {
    var m = st.init[me.layer];
    m.getContext('2d').clearRect(0, 0, m.width, m.height);
    drawMask();
  }

  function maskDone() {
    var i = st.init;
    ['mask', 'boost'].forEach(function (layer) {  // both may have changed (Rest in ...)
      var m = i[layer];
      if (!m) return;
      var a = m.getContext('2d').getImageData(0, 0, m.width, m.height).data, n = 0, on = 0;
      for (var k = 3; k < a.length; k += 64) { n++; if (a[k] > 127) on++; }
      if (layer === 'boost') i.boostPainted = n ? on / n : 0;
      else i.painted = n ? on / n : 0;
      if (!on) i[layer] = null;
    });
    show('me', false);
    drawInit();
  }

  // Directional canvas outpainting / re-framing: expands the canvas in a chosen direction
  // (left, right, up, down, or all) and automatically masks the expanded margins so
  // Stable Diffusion outpaints the extended environment while keeping the original image intact.
  function outpaintCanvas(dir, pct) {
    var i = st.init;
    if (!i || !i.canvas) {
      toast('Load or select an image to outpaint first.');
      return;
    }
    pct = pct || 0.25;
    var curW = i.canvas.width;
    var curH = i.canvas.height;
    var addW = 0, addH = 0;
    var offX = 0, offY = 0;

    if (dir === 'left') {
      addW = Math.max(64, Math.round(curW * pct / 64) * 64);
      offX = addW;
    } else if (dir === 'right') {
      addW = Math.max(64, Math.round(curW * pct / 64) * 64);
    } else if (dir === 'up') {
      addH = Math.max(64, Math.round(curH * pct / 64) * 64);
      offY = addH;
    } else if (dir === 'down') {
      addH = Math.max(64, Math.round(curH * pct / 64) * 64);
    } else if (dir === 'all') {
      addW = Math.max(64, Math.round(curW * (pct / 2) / 64) * 64) * 2;
      addH = Math.max(64, Math.round(curH * (pct / 2) / 64) * 64) * 2;
      offX = addW / 2;
      offY = addH / 2;
    }

    var newW = curW + addW;
    var newH = curH + addH;
    if (Math.max(newW, newH) > INIT_MAX) {
      toast('Expanded dimensions exceed maximum supported ' + INIT_MAX + 'px.');
      return;
    }

    var newC = canvasOf(newW, newH);
    var ctxC = newC.getContext('2d');
    ctxC.drawImage(i.canvas, offX, offY);

    var newM = canvasOf(newW, newH);
    var ctxM = newM.getContext('2d');
    if (i.mask) {
      ctxM.drawImage(i.mask, offX, offY);
    }
    ctxM.fillStyle = 'rgba(255, 48, 48, 1.0)';
    if (offX > 0) ctxM.fillRect(0, 0, offX, newH);
    if (addW - offX > 0) ctxM.fillRect(curW + offX, 0, addW - offX, newH);
    if (offY > 0) ctxM.fillRect(0, 0, newW, offY);
    if (addH - offY > 0) ctxM.fillRect(0, curH + offY, newW, addH - offY);

    var totalPix = newW * newH;
    var outpaintPix = totalPix - (curW * curH);
    var paintedShare = Math.min(1.0, outpaintPix / totalPix);

    st.init = {
      canvas: newC,
      name: (i.name || 'image') + '-outpaint',
      mask: newM,
      painted: Math.max(0.1, paintedShare)
    };

    var f = fitArea(newW, newH, st.preset ? st.preset.w * st.preset.h : 1024 * 1024);
    $('w').value = f.w;
    $('h').value = f.h;
    markPreset();
    persist();
    drawInit();
    toast('Canvas expanded ' + dir + ' by ' + Math.round(pct * 100) + '%. Outer margins are masked for AI outpainting.');
  }

  // ---- the request and putting the result back
  // The box around the painted part of the mask, or null.
  function maskBounds(m) {
    var w = m.width, h = m.height, a = m.getContext('2d').getImageData(0, 0, w, h).data;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0, k = y * w * 4 + 3; x < w; x++, k += 4) {
        if (a[k] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // b grown to the aspect `ratio` around its middle, and kept inside W x H.
  function growBox(b, ratio, W, H) {
    var w = b.w, h = b.h;
    if (w / h < ratio) w = Math.min(W, Math.round(h * ratio)); else h = Math.min(H, Math.round(w / ratio));
    var x = Math.round(b.x + b.w / 2 - w / 2), y = Math.round(b.y + b.h / 2 - h / 2);
    x = Math.max(0, Math.min(W - w, x));
    y = Math.max(0, Math.min(H - h, y));
    return { x: x, y: y, w: w, h: h };
  }

  // A two-pass box blur of a w x h array in place (radius r), for the mask's soft edge.
  function blur(a, w, h, r) {
    var tmp = new Float32Array(Math.max(w, h)), x, y, sum, n = 2 * r + 1;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) tmp[x] = a[y * w + x];
      sum = 0;
      for (x = -r; x <= r; x++) sum += tmp[Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++) {
        a[y * w + x] = sum / n;
        sum += tmp[Math.min(w - 1, x + r + 1)] - tmp[Math.max(0, x - r)];
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) tmp[y] = a[y * w + x];
      sum = 0;
      for (y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y))];
      for (y = 0; y < h; y++) {
        a[y * w + x] = sum / n;
        sum += tmp[Math.min(h - 1, y + r + 1)] - tmp[Math.max(0, y - r)];
      }
    }
  }

  // The mask's box (in start-image pixels) as a gray w x h canvas with a soft edge: white changes.
  function softMask(m, box, w, h) {
    var c = canvasOf(w, h), g = c.getContext('2d');
    g.drawImage(m, box.x, box.y, box.w, box.h, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h), px = d.data, al = new Float32Array(w * h), i;
    for (i = 0; i < w * h; i++) al[i] = px[i * 4 + 3];
    blur(al, w, h, Math.max(2, Math.round(Math.min(w, h) / 96)));
    for (i = 0; i < w * h; i++) {
      var v = Math.round(al[i]);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  // What a request sends for the start image: {init, mask (data URLs), w, h (the size made), box (the part
  // of the start image it stands for), crop, soft (the soft mask canvas), source (the start image)}.
  function initRequest(f) {
    var i = st.init, W = i.canvas.width, H = i.canvas.height, gw = f.w, gh = f.h, box;
    var ref = refEdit();
    var crop = !!(i.mask && !ref && $('init-crop').checked);
    var b = crop ? maskBounds(i.mask) : null;
    if (b) {
      var pad = Math.max(32, Math.round(Math.max(W, H) / 32));
      var x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad);
      var x1 = Math.min(W, b.x + b.w + pad), y1 = Math.min(H, b.y + b.h + pad);
      box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      var g0 = fitArea(box.w, box.h, f.w * f.h);
      box = growBox(box, g0.w / g0.h, W, H);
      var g1 = fitArea(box.w, box.h, f.w * f.h);
      gw = g1.w;
      gh = g1.h;
    } else {
      crop = false;
      // the largest centred part of the start image with the form's aspect
      box = W / H > gw / gh ? { x: Math.round((W - H * gw / gh) / 2), y: 0, w: Math.round(H * gw / gh), h: H }
        : { x: 0, y: Math.round((H - W * gh / gw) / 2), w: W, h: Math.round(W * gh / gw) };
    }
    var ic = canvasOf(gw, gh);
    ic.getContext('2d').drawImage(i.canvas, box.x, box.y, box.w, box.h, 0, 0, gw, gh);
    var out = { init: ic.toDataURL('image/png'), mask: null, soft: null, w: gw, h: gh, box: box, crop: crop, source: i.canvas, ref: ref,
      sourceUrl: crop ? i.canvas.toDataURL('image/png') : null, srcW: W, srcH: H,
      layers: { mask: smallLayer(i.mask), boost: ref ? smallLayer(i.boost) : null } };
    if (ref && i.boost && refMaskable()) out.boostGrid = boostGrid(i.boost, box, gw, gh);
    // A red mask without a green one: Ref Boost pulls only toward the part of the photo that is
    // kept, not toward what the red part replaces (pulled back to the old content, the new one
    // came out as a smeared mix of both).
    else if (ref && i.mask && refMaskable()) out.boostGrid = boostGrid(i.mask, box, gw, gh, true);
    if (i.mask && (!ref || refMaskable())) {
      out.soft = softMask(i.mask, box, gw, gh);
      out.mask = out.soft.toDataURL('image/png');
    }
    return out;
  }

  // The red and green layers, at most 384 px, as PNG data URLs kept with an edit's settings
  // (succeed() adds them to the saved picture's SDCPP JSON as "machete_masks").
  function smallLayer(layer) {
    if (!layer) return null;
    var k = Math.min(1, 384 / Math.max(layer.width, layer.height));
    var c = canvasOf(Math.max(1, Math.round(layer.width * k)), Math.max(1, Math.round(layer.height * k)));
    c.getContext('2d').drawImage(layer, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // "Use these settings": the layers of an edit back onto the start image in the Create tab (the
  // same photo has to be loaded there). The red and green kept with the picture, else the green
  // from the Ref Boost grid of its request. Returns a sentence for the toast.
  function restoreMasks(j) {
    var mm = j.machete_masks || null;
    var grid = /(?:^|,)ref_boost_mask=(\d+)x(\d+):([0-9a-f]+)/.exec(String(j.ref_image_args || ''));
    if (!mm && !grid) return '';
    var i = st.init;
    // No start image yet: the masks wait for the next one (Edit on the same photo).
    if (!i) { st.pendingMasks = j; return ' Its mask goes on the next start image: press Edit on the same photo (or Start from an image).'; }
    st.pendingMasks = null;
    var W = i.canvas.width, H = i.canvas.height;
    function painted(c) {
      var a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = 0, on = 0;
      for (var k = 3; k < a.length; k += 64) { n++; if (a[k] > 127) on++; }
      return n ? on / n : 0;
    }
    function fromUrl(url, layer, rgb) {
      var im = new Image();
      im.onload = function () {
        var c = canvasOf(W, H), g = c.getContext('2d');
        g.drawImage(im, 0, 0, W, H);
        var d = g.getImageData(0, 0, W, H), a = d.data;
        for (var k = 0; k < a.length; k += 4) { a[k] = rgb[0]; a[k + 1] = rgb[1]; a[k + 2] = rgb[2]; }
        g.putImageData(d, 0, 0);
        var p = painted(c);
        i[layer] = p > 0 ? c : null;
        if (layer === 'boost') i.boostPainted = p; else i.painted = p;
        drawInit();
      };
      im.src = url;
    }
    if (mm) {
      if (mm.mask) fromUrl(mm.mask, 'mask', layerRGB.mask); else i.mask = null;
      if (mm.boost) fromUrl(mm.boost, 'boost', layerRGB.boost); else i.boost = null;
    } else {
      var gw = +grid[1], gh = +grid[2], hex = grid[3];
      var c = canvasOf(gw, gh), g = c.getContext('2d'), d = g.createImageData(gw, gh), a = d.data;
      for (var k = 0; k < gw * gh && k < hex.length; k++) {
        a[k * 4] = layerRGB.boost[0]; a[k * 4 + 1] = layerRGB.boost[1]; a[k * 4 + 2] = layerRGB.boost[2];
        a[k * 4 + 3] = Math.round(parseInt(hex.charAt(k), 16) / 15 * 255);
      }
      g.putImageData(d, 0, 0);
      fromUrl(c.toDataURL('image/png'), 'boost', layerRGB.boost);
    }
    return ' Its mask is back on the start image.';
  }

  // The Ref Boost area on the DiT's token grid (one cell a 16x16 pixel patch of the w x h made):
  // "WxH:" then one hex digit a cell, its painted share 0-f, row major (ref_boost_mask).
  function boostGrid(layer, box, w, h, invert) {
    var gw = Math.ceil(w / 16), gh = Math.ceil(h / 16), c = canvasOf(gw, gh), g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(layer, box.x, box.y, box.w, box.h, 0, 0, gw, gh);
    var a = g.getImageData(0, 0, gw, gh).data, s = gw + 'x' + gh + ':';
    for (var k = 3; k < a.length; k += 4) s += Math.round((invert ? 255 - a[k] : a[k]) / 255 * 15).toString(16);
    return s;
  }

  // A result blended over the start image where the mask is: the whole start image for "only the
  // masked area", else the part that was made. cb(base64 PNG).
  // Loads data URLs as images; cb(images, or null when one would not load).
  function loadImages(urls, cb) {
    var out = [], left = urls.length, failed = false;
    urls.forEach(function (u, k) {
      var im = new Image();
      im.onload = function () { out[k] = im; if (--left === 0) cb(failed ? null : out); };
      im.onerror = function () { failed = true; if (--left === 0) cb(null); };
      im.src = u;
    });
  }

  // The start image, the mask and the result are read back from the data URLs the request kept,
  // not from the canvases: a phone's browser may empty canvases while the page waits in the
  // background through a long run, which put back a black picture.
  function putBackOne(rq, b64, cb) {
    var urls = [dataUrl(b64), rq.init, rq.mask];
    if (rq.crop) urls.push(rq.sourceUrl);
    loadImages(urls, function (ims) {
      if (!ims) { cb(b64); return; }
      var tw = rq.crop ? rq.box.w : rq.w, th = rq.crop ? rq.box.h : rq.h;
      var base = canvasOf(tw, th), bg = base.getContext('2d');
      if (rq.crop) bg.drawImage(ims[3], rq.box.x, rq.box.y, rq.box.w, rq.box.h, 0, 0, tw, th);
      else bg.drawImage(ims[1], 0, 0, tw, th);
      var res = canvasOf(tw, th), rg = res.getContext('2d');
      rg.drawImage(ims[0], 0, 0, tw, th);
      var mk = canvasOf(tw, th), mg = mk.getContext('2d');
      mg.drawImage(ims[2], 0, 0, tw, th);
      var bd = bg.getImageData(0, 0, tw, th), rd = rg.getImageData(0, 0, tw, th).data, md = mg.getImageData(0, 0, tw, th).data;
      var px = bd.data;
      for (var k = 0; k < px.length; k += 4) {
        var a = md[k] / 255;
        px[k] = px[k] * (1 - a) + rd[k] * a;
        px[k + 1] = px[k + 1] * (1 - a) + rd[k + 1] * a;
        px[k + 2] = px[k + 2] * (1 - a) + rd[k + 2] * a;
        px[k + 3] = 255;
      }
      bg.putImageData(bd, 0, 0);
      res.width = mk.width = 0;  // let the phone's canvas memory go
      var outc = base;
      if (rq.crop) {
        outc = canvasOf(rq.srcW, rq.srcH);
        var og = outc.getContext('2d');
        og.drawImage(ims[3], 0, 0, rq.srcW, rq.srcH);
        og.drawImage(base, rq.box.x, rq.box.y);
      }
      var url = outc.toDataURL('image/png');
      base.width = outc.width = 0;
      cb(url.substring(url.indexOf(',') + 1));
    });
  }

  function putBack(rq, images, cb) {
    var out = [];
    (function next(k) {
      if (k >= images.length) { cb(out); return; }
      putBackOne(rq, images[k], function (b) { out.push(b); next(k + 1); });
    })(0);
  }

  // The gallery gets the put-together images in place of the raw results the server saved.
  function saveEdits(results, raw) {
    var k = 0;
    (function next() {
      if (k >= results.length) {
        if (raw.length === results.length) {
          for (var j = 0; j < raw.length; j++) req('DELETE', APP + '/gallery/' + encodeURIComponent(raw[j].name), null, function () {});
        }
        setTimeout(function () { loadGallery(null); }, 300);
        if (!st.busy && st.results === results) pickResult(st.pick);
        if (st.runMode) drawStrip();   // a page run's strip gets the names of its images
        return;
      }
      var r = results[k];
      var body = { image: r.src.substring(r.src.indexOf(',') + 1) };
      if (r.params) body.parameters = r.params;
      req('POST', APP + '/gallery', body, function (code, data) {
        if (code === 201 && data && data.saved) {
          r.name = data.saved;
          r.url = '/ps5sd/v1/gallery/' + encodeURIComponent(data.saved);
          k++;
          next();
        } else {
          // an app without the route: the raw results stay in the gallery
          if (raw.length === results.length) for (var j = 0; j < raw.length; j++) { results[j].url = raw[j].url; results[j].name = raw[j].name; }
          if (!st.busy && st.results === results) pickResult(st.pick);
        }
      }, 120000);
    })();
  }


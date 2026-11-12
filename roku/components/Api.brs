' Tarea en segundo plano: internet, cuenta MiVibra (Firebase), listas M3U / Xtream y el panel web.

sub init()
    m.top.functionName = "work"
end sub

sub work()
    r = m.top.req
    c = r.cmd
    out = invalid
    if c = "ping" then
        out = { pong: true }
    else if c = "load" then
        out = cmdLoad(r)
    else if c = "login" then
        out = cmdLogin(r)
    else if c = "push" then
        out = cmdPush(r)
    else if c = "inbox" then
        out = cmdInbox(r)
    else if c = "eps" then
        out = cmdEps(r)
    else if c = "streams" then
        out = cmdStreams(r)
    else if c = "epg" then
        out = cmdEpg(r)
    else if c = "yt" then
        out = cmdYt(r)
    else if c = "ytplay" then
        out = cmdYtPlay(r)
    else if c = "music" then
        out = cmdMusic(r)
    end if
    if out = invalid then out = {}
    out.cmd = c
    out.id = r.id
    m.top.res = out
end sub

' ---------- Internet ----------
function http(method as String, url as String, body = "" as String, headers = invalid as Object, timeoutMs = 25000 as Integer) as Object
    ut = CreateObject("roUrlTransfer")
    port = CreateObject("roMessagePort")
    ut.SetMessagePort(port)
    ut.SetUrl(url)
    ut.SetCertificatesFile("common:/certs/ca-bundle.crt")
    ut.InitClientCertificates()
    ut.EnableEncodings(true)
    ut.RetainBodyOnError(true)
    ut.AddHeader("User-Agent", "MiVibraTV-Roku/1.0")
    if headers <> invalid then
        for each k in headers
            ut.AddHeader(k, headers[k])
        end for
    end if
    ok = false
    if method = "GET" then
        ok = ut.AsyncGetToString()
    else
        ut.SetRequest(method)
        ok = ut.AsyncPostFromString(body)
    end if
    if not ok then return { code: -1, body: "" }
    msg = wait(timeoutMs, port)
    if type(msg) = "roUrlEvent" then
        b = msg.GetString()
        if b = invalid then b = ""
        return { code: msg.GetResponseCode(), body: b }
    end if
    ut.AsyncCancel()
    return { code: -2, body: "" }
end function

function httpJson(method as String, url as String, body = "" as String, headers = invalid as Object) as Object
    r = http(method, url, body, headers)
    j = invalid
    if r.body <> "" then j = ParseJson(r.body)
    return { code: r.code, j: j }
end function

function enc(s as String) as String
    return CreateObject("roUrlTransfer").Escape(s)
end function

function formHdr() as Object
    return { "Content-Type": "application/x-www-form-urlencoded" }
end function

function jsonHdr() as Object
    return { "Content-Type": "application/json" }
end function

' ---------- Cuenta (Firebase) ----------
function fbAuth(auth as Dynamic) as Dynamic
    if auth = invalid or auth.refresh = invalid or auth.refresh = "" then return invalid
    now = nowSec()
    if auth.id <> invalid and auth.exp <> invalid and auth.exp > now + 300 then return auth
    cfg = mvConfig()
    r = httpJson("POST", "https://securetoken.googleapis.com/v1/token?key=" + cfg.apiKey, "grant_type=refresh_token&refresh_token=" + enc(auth.refresh), formHdr())
    if r.code = 400 or r.code = 401 then return { revoked: true }
    if r.code <> 200 or r.j = invalid then return invalid
    return { id: r.j.id_token, refresh: r.j.refresh_token, uid: r.j.user_id, email: auth.email, exp: now + Val(toS(r.j.expires_in)) }
end function

function fsUrl(path as String) as String
    return "https://firestore.googleapis.com/v1/projects/" + mvConfig().projectId + "/databases/(default)/documents/" + path
end function

function fsGet(path as String, auth as Dynamic, query = "" as String) as Object
    h = {}
    if auth <> invalid and auth.id <> invalid then h["Authorization"] = "Bearer " + auth.id
    u = fsUrl(path) + "?key=" + mvConfig().apiKey + query
    return httpJson("GET", u, "", h)
end function

function idpSignIn(cfg as Object, postBody as String) as Object
    body = FormatJson({ postBody: postBody, requestUri: "http://localhost", returnSecureToken: true, returnIdpCredential: true })
    return httpJson("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + cfg.apiKey, body, jsonHdr())
end function

' Inicio con código: se aprueba desde el celular en google.com/device
function cmdLogin(r as Object) as Object
    cfg = mvConfig()
    if cfg.tvClientId = "" or cfg.apiKey = "" then return { error: "Esta versión no tiene configurada la cuenta MiVibra." }
    d = httpJson("POST", "https://oauth2.googleapis.com/device/code", "client_id=" + enc(cfg.tvClientId) + "&scope=" + enc("openid email profile"), formHdr())
    if d.j = invalid or d.j.device_code = invalid then return { error: "Google no entregó el código. Intenta de nuevo." }
    url = "https://www.google.com/device"
    if d.j.verification_url <> invalid then url = d.j.verification_url
    m.top.prog = { code: d.j.user_code, url: url }
    ivl = 5
    if d.j.interval <> invalid then ivl = d.j.interval
    expires = 1800
    if d.j.expires_in <> invalid then expires = d.j.expires_in
    deadline = nowSec() + expires
    while nowSec() < deadline
        sleep(ivl * 1000)
        if m.top.cancel = true then return { error: "cancel" }
        t = httpJson("POST", "https://oauth2.googleapis.com/token", "client_id=" + enc(cfg.tvClientId) + "&client_secret=" + enc(cfg.tvClientSecret) + "&device_code=" + enc(d.j.device_code) + "&grant_type=" + enc("urn:ietf:params:oauth:grant-type:device_code"), formHdr())
        if t.j <> invalid and t.j.id_token <> invalid then
            ' Igual que la app web: se entregan el id_token y el access_token. Firebase rechaza el id_token solo cuando
            ' es de otro cliente (el de TV), pero acepta el access_token; si aun así falla, se prueba solo con el access_token.
            at = ""
            if t.j.access_token <> invalid then at = t.j.access_token
            f = idpSignIn(cfg, "id_token=" + t.j.id_token + "&access_token=" + at + "&providerId=google.com")
            if (f.j = invalid or f.j.idToken = invalid) and at <> "" then f = idpSignIn(cfg, "access_token=" + at + "&providerId=google.com")
            if f.j = invalid or f.j.idToken = invalid then
                why = ""
                if f.j <> invalid and f.j.error <> invalid and f.j.error.message <> invalid then why = " (" + f.j.error.message + ")"
                return { error: "Firebase no aceptó la cuenta" + why + ". Revisa la configuración de MiVibra." }
            end if
            return { auth: { id: f.j.idToken, refresh: f.j.refreshToken, uid: f.j.localId, email: f.j.email, exp: nowSec() + Val(toS(f.j.expiresIn)) } }
        end if
        e = ""
        if t.j <> invalid and t.j.error <> invalid then e = t.j.error
        if e = "slow_down" then
            ivl = ivl + 5
        else if e = "access_denied" then
            return { error: "Se canceló el inicio de sesión." }
        else if e = "expired_token" then
            return { error: "El código venció. Pide uno nuevo." }
        else if e <> "authorization_pending" and e <> "" then
            return { error: "No se pudo iniciar sesión (" + e + ")." }
        end if
    end while
    return { error: "El código venció. Pide uno nuevo." }
end function

' ---------- Cargar todo: cuenta, listas incluidas, listas propias y panel web ----------
function cmdLoad(r as Object) as Object
    out = { errors: [] }
    lists = []
    auth = invalid
    if r.auth <> invalid then
        auth = fbAuth(r.auth)
        if auth = invalid then
            out.errors.Push("Sin conexión con la cuenta: se usan los datos guardados.")
        else if auth.revoked = true then
            out.signedOut = true
            auth = invalid
        else
            out.auth = auth
        end if
    end if
    if auth <> invalid then
        c = fsGet("app/config", auth)
        if c.code = 200 and c.j <> invalid then
            cfg = fsMap(c.j.fields)
            out.managed = true
            if cfg.ytKey <> invalid then out.ytKey = cfg.ytKey
            if cfg.lists <> invalid then
                for each l in cfg.lists
                    lists.Push(l)
                end for
            end if
        else if c.code = 403 then
            out.denied = true
        end if
        u = fsGet("mivibra/" + auth.uid, auth)
        if u.code = 200 and u.j <> invalid then
            ud = fsMap(u.j.fields)
            out.user = { profiles: ud.profiles, pdata: ud.pdata }
            if ud.lists <> invalid then
                for each l in ud.lists
                    lists.Push(l)
                end for
            end if
        end if
    end if
    ' Listas que llegaron desde el panel web a este Roku
    mine = []
    if r.lists <> invalid then mine = r.lists
    got = inboxFetch(r.code)
    for each l in got
        mine.Push(l)
    end for
    out.lists = mine
    out.inbox = got.Count()
    for each l in mine
        lists.Push(l)
    end for
    addons = []
    out.catalog = buildCatalog(lists, out.errors, addons)
    out.addons = addons
    return out
end function

function cmdInbox(r as Object) as Object
    return { got: inboxFetch(r.code) }
end function

function inboxFetch(code as Dynamic) as Object
    got = []
    if code = invalid or code = "" or mvConfig().projectId = "" then return got
    res = fsGet("inbox/" + code + "/lists", invalid)
    if res.code <> 200 or res.j = invalid or res.j.documents = invalid then return got
    for each d in res.j.documents
        l = fsMap(d.fields)
        if l.type = "url" or l.type = "xtream" then
            l.id = "r" + nowSec().ToStr() + got.Count().ToStr()
            l.enabled = true
            got.Push(l)
        end if
        ' Se borra del buzón apenas llega
        http("DELETE", "https://firestore.googleapis.com/v1/" + d.name + "?key=" + mvConfig().apiKey)
    end for
    return got
end function

' ---------- Catálogo ----------
function buildCatalog(lists as Object, errors as Object, addons as Object) as Object
    acc = { live: {}, liveOrder: [], movie: {}, movieOrder: [], series: {}, seriesOrder: [] }
    seen = {}
    for each l in lists
        if l <> invalid and l.enabled <> false then
            sig = toS(l.type) + "|" + toS(l.url) + "|" + toS(l.host) + "|" + toS(l.user)
            if not seen.DoesExist(sig) then
                seen[sig] = true
                nm = toS(l.name)
                if l.type = "url" and toS(l.url) <> "" then
                    loadM3U(l, acc, errors)
                else if l.type = "xtream" then
                    loadXtream(l, acc, errors)
                else if l.type = "stremio" and toS(l.url) <> "" then
                    loadStremio(l, acc, errors, addons)
                else if l.type = "plex" then
                    loadPlex(l, acc, errors)
                else if l.type = "jellyfin" then
                    loadJellyfin(l, acc, errors)
                else if l.type = "stalker" then
                    errors.Push(nm + ": los portales MAC no funcionan en Roku.")
                end if
            end if
        end if
    end for
    return {
        live: toGroups(acc.live, acc.liveOrder)
        movie: toGroups(acc.movie, acc.movieOrder)
        series: toGroups(acc.series, acc.seriesOrder)
    }
end function

function toGroups(map as Object, order as Object) as Object
    out = []
    for each g in order
        out.Push({ g: g, n: map[g] })
    end for
    return out
end function

sub addItem(acc as Object, kind as String, g as String, it as Object)
    if g = "" then
        if kind = "live" then
            g = "En vivo"
        else if kind = "movie" then
            g = "Películas"
        else
            g = "Series"
        end if
    end if
    if isAdultGroup(g) then return
    map = acc[kind]
    if not map.DoesExist(g) then
        map[g] = []
        acc[kind + "Order"].Push(g)
    end if
    map[g].Push(it)
end sub

function attr(line as String, key as String) as String
    p = Instr(1, line, key + "=" + Chr(34))
    if p = 0 then return ""
    s = p + Len(key) + 2
    e = Instr(s, line, Chr(34))
    if e = 0 then return ""
    return Mid(line, s, e - s)
end function

' Enlaces de Xtream en .ts se piden en .m3u8 (Roku no reproduce MPEG-TS directo)
function fixLive(u as String) as String
    r = CreateObject("roRegex", "^(https?://[^/]+)/(live/)?([^/]+)/([^/]+)/(\d+)(\.ts)?$", "i")
    mm = r.Match(u)
    if mm.Count() > 0 then return mm[1] + "/live/" + mm[3] + "/" + mm[4] + "/" + mm[5] + ".m3u8"
    return u
end function

sub loadM3U(l as Object, acc as Object, errors as Object)
    res = http("GET", toS(l.url), "", invalid, 60000)
    if res.code <> 200 or res.body = "" then
        errors.Push(toS(l.name) + ": no se pudo descargar la lista (" + res.code.ToStr() + ").")
        return
    end if
    parseM3U(res.body, acc)
end sub

sub parseM3U(text as String, acc as Object)
    lines = text.Tokenize(Chr(10))
    cur = invalid
    rxEp = CreateObject("roRegex", "^(.*?)[\s\-_.]*[Ss](\d{1,2})\s*[Ee](\d{1,3})", "")
    rxMovieGroup = CreateObject("roRegex", "pel[ií]cula|movie|vod|cine|film", "i")
    rxVid = CreateObject("roRegex", "\.(mp4|mkv|avi|mov|m4v)(\?|$)", "i")
    series = {}
    n = 0
    for each ln in lines
        ln = ln.Trim()
        if Left(ln, 7) = "#EXTINF" then
            ' El nombre va después de la última comilla de los atributos, tras la primera coma
            q = 0
            p = Instr(1, ln, Chr(34))
            while p > 0
                q = p
                p = Instr(p + 1, ln, Chr(34))
            end while
            cpos = Instr(q + 1, ln, ",")
            name = ""
            if cpos > 0 then name = Mid(ln, cpos + 1).Trim()
            cur = { n: name, p: attr(ln, "tvg-logo"), g: attr(ln, "group-title"), tvg: attr(ln, "tvg-id") }
        else if ln <> "" and Left(ln, 1) <> "#" and cur <> invalid then
            u = ln
            if Instr(1, u, "/series/") > 0 then
                mm = rxEp.Match(cur.n)
                sname = cur.n
                se = 1
                ep = 0
                if mm.Count() > 0 then
                    sname = mm[1].Trim()
                    se = Val(mm[2])
                    ep = Val(mm[3])
                end if
                if sname = "" then sname = cur.n
                if not series.DoesExist(sname) then
                    s = { t: "series", n: sname, p: cur.p, eps: [] }
                    series[sname] = s
                    addItem(acc, "series", cur.g, s)
                end if
                series[sname].eps.Push({ n: cur.n, u: u, s: se, e: ep })
            else if Instr(1, u, "/movie/") > 0 or (rxMovieGroup.IsMatch(cur.g) and rxVid.IsMatch(u)) then
                addItem(acc, "movie", cur.g, { t: "movie", n: cur.n, p: cur.p, u: u })
            else
                addItem(acc, "live", cur.g, { t: "live", n: cur.n, p: cur.p, u: fixLive(u), tvg: cur.tvg })
            end if
            cur = invalid
            n = n + 1
            if n > 60000 then exit for
        end if
    end for
end sub

function catNames(j as Dynamic) as Object
    mp = {}
    if type(j) <> "roArray" then return mp
    for each c in j
        mp[toS(c.category_id)] = toS(c.category_name)
    end for
    return mp
end function

sub loadXtream(l as Object, acc as Object, errors as Object)
    host = toS(l.host)
    if Right(host, 1) = "/" then host = Left(host, Len(host) - 1)
    u = toS(l.user)
    p = toS(l.pass)
    api = host + "/player_api.php?username=" + enc(u) + "&password=" + enc(p)
    who = toS(l.name)
    if who = "" then who = "Xtream"
    live = httpJson("GET", api + "&action=get_live_streams")
    if type(live.j) <> "roArray" then
        if live.code = 401 or live.code = 403 then
            errors.Push(who + ": usuario o contraseña incorrectos, o la cuenta venció.")
        else
            errors.Push(who + ": el servidor no respondió.")
        end if
        return
    end if
    lc = catNames(httpJson("GET", api + "&action=get_live_categories").j)
    for each c in live.j
        addItem(acc, "live", toS(lc[toS(c.category_id)]), { t: "live", n: toS(c.name), p: toS(c.stream_icon), u: host + "/live/" + u + "/" + p + "/" + toS(c.stream_id) + ".m3u8", tvg: toS(c.epg_channel_id) })
    end for
    vc = catNames(httpJson("GET", api + "&action=get_vod_categories").j)
    vod = httpJson("GET", api + "&action=get_vod_streams")
    if type(vod.j) = "roArray" then
        for each v in vod.j
            ext = toS(v.container_extension)
            if ext = "" then ext = "mp4"
            addItem(acc, "movie", toS(vc[toS(v.category_id)]), { t: "movie", n: toS(v.name), p: toS(v.stream_icon), u: host + "/movie/" + u + "/" + p + "/" + toS(v.stream_id) + "." + ext })
        end for
    end if
    sc = catNames(httpJson("GET", api + "&action=get_series_categories").j)
    ser = httpJson("GET", api + "&action=get_series")
    if type(ser.j) = "roArray" then
        for each s in ser.j
            addItem(acc, "series", toS(sc[toS(s.category_id)]), { t: "series", n: toS(s.name), p: toS(s.cover), xs: toS(s.series_id), h: host, us: u, pw: p })
        end for
    end if
end sub

' ---------- "Continuar viendo" y el historial se guardan en la cuenta (los ven el celular, el TV Android y el PC) ----------
function cmdPush(r as Object) as Object
    auth = fbAuth(r.auth)
    if auth = invalid or auth.revoked = true then return { error: "sin cuenta" }
    pid = r.pid
    fp = "pdata.`" + pid + "`"
    q = "&mask.fieldPaths=" + enc(fp + ".history") + "&mask.fieldPaths=" + enc(fp + ".progress")
    cur = fsGet("mivibra/" + auth.uid, auth, q)
    if cur.code <> 200 or cur.j = invalid then return { error: "no se pudo leer", auth: auth }
    d = fsMap(cur.j.fields)
    pd = {}
    if d.pdata <> invalid and d.pdata[pid] <> invalid then pd = d.pdata[pid]
    hist = []
    if type(pd.history) = "roArray" then hist = pd.history
    prog = {}
    if type(pd.progress) = "roAssociativeArray" then prog = pd.progress
    e = r.entry
    nh = [e]
    for each h in hist
        if h <> invalid and h.key <> e.key and nh.Count() < 150 then nh.Push(h)
    end for
    if r.pos <> invalid and r.dur <> invalid and r.dur > 0 then
        pct = r.pos / r.dur
        if pct > 0.95 or r.pos < 20000 then
            prog.Delete(e.key)
        else
            pe = {}
            pe.Append(e)
            pe.pos = r.pos
            pe.dur = r.dur
            prog[e.key] = pe
        end if
    end if
    body = { fields: { pdata: { mapValue: { fields: {} } } } }
    body.fields.pdata.mapValue.fields[pid] = { mapValue: { fields: { history: fsEnc(nh), progress: fsEnc(prog) } } }
    mask = "?updateMask.fieldPaths=" + enc(fp + ".history") + "&updateMask.fieldPaths=" + enc(fp + ".progress") + "&currentDocument.exists=true&key=" + mvConfig().apiKey
    res = http("PATCH", fsUrl("mivibra/" + auth.uid) + mask, FormatJson(body), { "Content-Type": "application/json", "Authorization": "Bearer " + auth.id })
    return { ok: res.code = 200, auth: auth, history: nh, progress: prog }
end function

' ---------- Capítulos (Xtream, Plex, Jellyfin y addons de Stremio) ----------
function cmdEps(r as Object) as Object
    it = r.item
    eps = []
    if it.xs <> invalid then
        api = it.h + "/player_api.php?username=" + enc(it.us) + "&password=" + enc(it.pw) + "&action=get_series_info&series_id=" + it.xs
        res = httpJson("GET", api)
        if res.j = invalid or type(res.j.episodes) <> "roAssociativeArray" then return { error: "No se pudieron cargar los capítulos.", eps: eps }
        for each k in res.j.episodes
            arr = res.j.episodes[k]
            if type(arr) = "roArray" then
                for each e in arr
                    ext = toS(e.container_extension)
                    if ext = "" then ext = "mp4"
                    eps.Push({ n: toS(e.title), u: it.h + "/series/" + it.us + "/" + it.pw + "/" + toS(e.id) + "." + ext, s: Val(k, 10), e: Val(toS(e.episode_num), 10) })
                end for
            end if
        end for
    else if it.px <> invalid then
        res = httpJson("GET", it.pxs + "/library/metadata/" + it.px + "/allLeaves?X-Plex-Token=" + enc(it.pxk), "", { "Accept": "application/json" })
        if res.j = invalid or res.j.MediaContainer = invalid or res.j.MediaContainer.Metadata = invalid then return { error: "No se pudieron cargar los capítulos.", eps: eps }
        for each e in res.j.MediaContainer.Metadata
            if e.Media <> invalid and e.Media.Count() > 0 and e.Media[0].Part <> invalid and e.Media[0].Part.Count() > 0 then
                sn = 1
                if e.parentIndex <> invalid then sn = e.parentIndex
                en = 0
                if e.index <> invalid then en = e.index
                eps.Push({ n: toS(e.title), u: it.pxs + toS(e.Media[0].Part[0].key) + "?X-Plex-Token=" + enc(it.pxk), s: sn, e: en })
            end if
        end for
    else if it.jf <> invalid then
        res = httpJson("GET", it.jfs + "/Shows/" + it.jf + "/Episodes?UserId=" + enc(it.jfu) + "&api_key=" + enc(it.jfk))
        if res.j = invalid or res.j.Items = invalid then return { error: "No se pudieron cargar los capítulos.", eps: eps }
        for each e in res.j.Items
            sn = 1
            if e.ParentIndexNumber <> invalid then sn = e.ParentIndexNumber
            en = 0
            if e.IndexNumber <> invalid then en = e.IndexNumber
            eps.Push({ n: toS(e.Name), u: it.jfs + "/Videos/" + toS(e.Id) + "/stream?static=true&api_key=" + enc(it.jfk), s: sn, e: en })
        end for
    else if it.st <> invalid then
        res = httpJson("GET", it.sb + "/meta/" + it.sty + "/" + it.st + ".json")
        if res.j = invalid or res.j.meta = invalid or type(res.j.meta.videos) <> "roArray" then return { error: "Este addon no trae los capítulos.", eps: eps }
        for each v in res.j.meta.videos
            sn = 1
            if v.season <> invalid then sn = v.season
            en = 0
            if v.episode <> invalid then en = v.episode
            if v.number <> invalid and en = 0 then en = v.number
            ttl = toS(v.title)
            if ttl = "" then ttl = toS(v.name)
            if sn > 0 then eps.Push({ n: ttl, vid: toS(v.id), sty: it.sty, s: sn, e: en })
        end for
    end if
    return { eps: eps }
end function

' ---------- Addons de Stremio ----------
function genreEs(g as String) as String
    mp = { "action": "Acción", "adventure": "Aventura", "animation": "Animación", "comedy": "Comedia", "crime": "Crimen", "documentary": "Documental", "drama": "Drama", "family": "Familia", "fantasy": "Fantasía", "history": "Historia", "horror": "Terror", "music": "Música", "mystery": "Misterio", "romance": "Romance", "science fiction": "Ciencia ficción", "sci-fi": "Ciencia ficción", "sci-fi & fantasy": "Ciencia ficción", "thriller": "Suspenso", "war": "Bélica", "western": "Western", "anime": "Anime", "reality": "Reality", "talk": "Programas", "news": "Noticias", "kids": "Infantil", "action & adventure": "Acción", "war & politics": "Bélica", "soap": "Novelas", "biography": "Biografía", "sport": "Deportes", "musical": "Música", "short": "Cortos" }
    k = LCase(g.Trim())
    if mp.DoesExist(k) then return mp[k]
    return g
end function

function hasRes(res as Object, name as String) as Boolean
    for each r in res
        if r = name then return true
    end for
    return false
end function

sub loadStremio(l as Object, acc as Object, errors as Object, addons as Object)
    base = toS(l.url).Replace("stremio://", "https://")
    if LCase(Right(base, 14)) = "/manifest.json" then base = Left(base, Len(base) - 14)
    if Right(base, 1) = "/" then base = Left(base, Len(base) - 1)
    who = toS(l.name)
    mres = httpJson("GET", base + "/manifest.json")
    man = mres.j
    if man = invalid then
        errors.Push(who + ": el addon no respondió.")
        return
    end if
    if who = "" then who = toS(man.name)
    res = []
    if type(man.resources) = "roArray" then
        for each r in man.resources
            if isStr(r) then
                res.Push(r)
            else if r <> invalid and r.name <> invalid then
                res.Push(toS(r.name))
            end if
        end for
    end if
    pre = []
    if type(man.idPrefixes) = "roArray" then pre = man.idPrefixes
    addons.Push({ b: base, n: who, res: res, pre: pre })
    if type(man.catalogs) <> "roArray" then return
    seen = {}
    nc = 0
    total = 0
    for each c in man.catalogs
        ty = LCase(toS(c.type))
        need = false
        if type(c.extra) = "roArray" then
            for each x in c.extra
                if x <> invalid and x.isRequired = true then need = true
            end for
        end if
        if type(c.extraRequired) = "roArray" and c.extraRequired.Count() > 0 then need = true
        okType = (ty = "movie" or ty = "series" or ty = "anime" or ty = "tv shows" or ty = "shows")
        if okType and not need and nc < 25 and total < 6000 then
            nc = nc + 1
            kind = "movie"
            if ty <> "movie" then kind = "series"
            skip = 0
            for page = 1 to 4
                url = base + "/catalog/" + toS(c.type) + "/" + toS(c.id) + ".json"
                if skip > 0 then url = base + "/catalog/" + toS(c.type) + "/" + toS(c.id) + "/skip=" + skip.ToStr() + ".json"
                rr = httpJson("GET", url)
                if rr.j = invalid or type(rr.j.metas) <> "roArray" or rr.j.metas.Count() = 0 then exit for
                for each mt in rr.j.metas
                    id = toS(mt.id)
                    if id <> "" and not seen.DoesExist(id) then
                        seen[id] = true
                        g = ""
                        if type(mt.genres) = "roArray" and mt.genres.Count() > 0 then g = genreEs(toS(mt.genres[0]))
                        if g = "" then g = toS(c.name)
                        nm = toS(mt.name)
                        y = Left(toS(mt.releaseInfo), 4)
                        if kind = "movie" and Len(y) = 4 and Instr(1, nm, "(" + y + ")") = 0 then nm = nm + " (" + y + ")"
                        addItem(acc, kind, g, { t: kind, n: nm, p: toS(mt.poster), st: id, sty: toS(mt.type), sb: base })
                        total = total + 1
                    end if
                end for
                skip = skip + rr.j.metas.Count()
                if rr.j.metas.Count() < 20 then exit for
            end for
        end if
    end for
end sub

' Enlaces para ver: se piden a los addons que dan "stream" para ese tipo e id
function cmdStreams(r as Object) as Object
    out = []
    lat = CreateObject("roRegex", "latino|lat\b|castellano|espa[nñ]ol|spanish|\bspa\b|\besp\b|dual", "i")
    first = []
    rest = []
    for each a in r.addons
        okPre = (a.pre.Count() = 0)
        for each p in a.pre
            if Left(r.sid, Len(p)) = p then okPre = true
        end for
        if hasRes(a.res, "stream") and okPre then
            res = httpJson("GET", a.b + "/stream/" + r.sty + "/" + r.sid + ".json")
            if res.j <> invalid and type(res.j.streams) = "roArray" then
                for each s in res.j.streams
                    u = toS(s.url)
                    if Left(u, 4) = "http" then
                        lbl = (toS(s.name) + " " + toS(s.title) + " " + toS(s.description)).Replace(Chr(10), " · ").Trim()
                        if lbl = "" then lbl = "Enlace"
                        o = { n: a.n + " · " + lbl, u: u }
                        if lat.IsMatch(lbl) then
                            first.Push(o)
                        else
                            rest.Push(o)
                        end if
                    end if
                end for
            end if
        end if
    end for
    for each o in first
        out.Push(o)
    end for
    for each o in rest
        out.Push(o)
    end for
    return { streams: out }
end function

' ---------- Plex y Jellyfin ----------
sub loadPlex(l as Object, acc as Object, errors as Object)
    s = toS(l.server)
    if Right(s, 1) = "/" then s = Left(s, Len(s) - 1)
    k = toS(l.token)
    who = toS(l.name)
    if who = "" then who = "Plex"
    h = { "Accept": "application/json" }
    sec = httpJson("GET", s + "/library/sections?X-Plex-Token=" + enc(k), "", h)
    if sec.j = invalid or sec.j.MediaContainer = invalid or type(sec.j.MediaContainer.Directory) <> "roArray" then
        errors.Push(who + ": no se pudo conectar con tu servidor Plex.")
        return
    end if
    for each d in sec.j.MediaContainer.Directory
        dt = toS(d.type)
        if dt = "movie" or dt = "show" then
            all = httpJson("GET", s + "/library/sections/" + toS(d.key) + "/all?X-Plex-Token=" + enc(k), "", h)
            if all.j <> invalid and all.j.MediaContainer <> invalid and type(all.j.MediaContainer.Metadata) = "roArray" then
                g = who + " · " + toS(d.title)
                for each mt in all.j.MediaContainer.Metadata
                    pic = ""
                    if mt.thumb <> invalid then pic = s + "/photo/:/transcode?width=300&height=450&minSize=1&url=" + enc(toS(mt.thumb)) + "&X-Plex-Token=" + enc(k)
                    nm = toS(mt.title)
                    if dt = "movie" then
                        if mt.year <> invalid then nm = nm + " (" + toS(mt.year) + ")"
                        if mt.Media <> invalid and mt.Media.Count() > 0 and mt.Media[0].Part <> invalid and mt.Media[0].Part.Count() > 0 then
                            addItem(acc, "movie", g, { t: "movie", n: nm, p: pic, u: s + toS(mt.Media[0].Part[0].key) + "?X-Plex-Token=" + enc(k) })
                        end if
                    else
                        addItem(acc, "series", g, { t: "series", n: nm, p: pic, px: toS(mt.ratingKey), pxs: s, pxk: k })
                    end if
                end for
            end if
        end if
    end for
end sub

sub loadJellyfin(l as Object, acc as Object, errors as Object)
    s = toS(l.server)
    if Right(s, 1) = "/" then s = Left(s, Len(s) - 1)
    k = toS(l.token)
    uid = toS(l.uid)
    who = toS(l.name)
    if who = "" then who = "Jellyfin"
    for each kind in ["Movie", "Series"]
        res = httpJson("GET", s + "/Users/" + enc(uid) + "/Items?IncludeItemTypes=" + kind + "&Recursive=true&Fields=ProductionYear,Genres&Limit=4000&SortBy=DateCreated&SortOrder=Descending&api_key=" + enc(k))
        if res.j = invalid or type(res.j.Items) <> "roArray" then
            errors.Push(who + ": no se pudo conectar con tu servidor.")
            return
        end if
        for each d in res.j.Items
            id = toS(d.Id)
            pic = s + "/Items/" + id + "/Images/Primary?maxHeight=450&quality=90&api_key=" + enc(k)
            g = who
            if type(d.Genres) = "roArray" and d.Genres.Count() > 0 then g = who + " · " + genreEs(toS(d.Genres[0]))
            nm = toS(d.Name)
            if kind = "Movie" then
                if d.ProductionYear <> invalid then nm = nm + " (" + toS(d.ProductionYear) + ")"
                addItem(acc, "movie", g, { t: "movie", n: nm, p: pic, u: s + "/Videos/" + id + "/stream?static=true&api_key=" + enc(k) })
            else
                addItem(acc, "series", g, { t: "series", n: nm, p: pic, jf: id, jfs: s, jfk: k, jfu: uid })
            end if
        end for
    end for
end sub

' ---------- Guía de programación (servidores Xtream: lo que dan ahora y después) ----------
function b64(s as String) as String
    ba = CreateObject("roByteArray")
    ba.FromBase64String(s)
    return ba.ToAsciiString()
end function

function hhmm(sec as Integer) as String
    d = CreateObject("roDateTime")
    d.FromSeconds(sec)
    d.ToLocalTime()
    h = d.GetHours()
    mi = d.GetMinutes()
    t = h.ToStr() + ":"
    if mi < 10 then t = t + "0"
    return t + mi.ToStr()
end function

function cmdEpg(r as Object) as Object
    rx = CreateObject("roRegex", "^(https?://.+?)/live/([^/]+)/([^/]+)/(\d+)\.", "i")
    mm = rx.Match(toS(r.u))
    if mm.Count() = 0 then return { key: r.u }
    api = mm[1] + "/player_api.php?username=" + enc(mm[2]) + "&password=" + enc(mm[3]) + "&action=get_short_epg&stream_id=" + mm[4] + "&limit=4"
    res = httpJson("GET", api)
    if res.j = invalid or type(res.j.epg_listings) <> "roArray" then return { key: r.u }
    now = nowSec()
    progs = []
    for each p in res.j.epg_listings
        st = Val(toS(p.start_timestamp), 10)
        en = Val(toS(p.stop_timestamp), 10)
        if en > now then progs.Push({ t: b64(toS(p.title)).Trim(), a: hhmm(st), b: hhmm(en), s: st })
    end for
    return { key: r.u, progs: progs }
end function

' ---------- YouTube (se abre en la app oficial de YouTube del Roku) ----------
function unesc(s as String) as String
    return s.Replace("&quot;", Chr(34)).Replace("&#39;", "'").Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">")
end function

function cmdYt(r as Object) as Object
    k = toS(r.key)
    if k = "" then return { error: "nokey", items: [] }
    if toS(r.q) <> "" then
        url = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&regionCode=CO&relevanceLanguage=es&q=" + enc(r.q) + "&key=" + enc(k)
    else
        url = "https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=50&regionCode=CO&key=" + enc(k)
        if toS(r.cat) <> "" then url = url + "&videoCategoryId=" + r.cat
    end if
    res = httpJson("GET", url)
    items = []
    if res.j = invalid or type(res.j.items) <> "roArray" then return { error: "YouTube no respondió.", items: items }
    for each v in res.j.items
        vid = ""
        if isStr(v.id) then
            vid = v.id
        else if v.id <> invalid and v.id.videoId <> invalid then
            vid = v.id.videoId
        end if
        sn = v.snippet
        if vid <> "" and sn <> invalid then
            th = ""
            if sn.thumbnails <> invalid then
                if sn.thumbnails.high <> invalid then
                    th = toS(sn.thumbnails.high.url)
                else if sn.thumbnails.medium <> invalid then
                    th = toS(sn.thumbnails.medium.url)
                end if
            end if
            items.Push({ t: "yt", n: unesc(toS(sn.title)), p: th, vid: vid, sub: toS(sn.channelTitle) })
        end if
    end for
    return { items: items, key: r.rk }
end function

function cmdYtPlay(r as Object) as Object
    apps = http("GET", "http://127.0.0.1:8060/query/apps", "", invalid, 5000)
    if apps.code = 200 and Instr(1, apps.body, "id=" + Chr(34) + "837" + Chr(34)) = 0 then return { error: "Instala la app YouTube en este Roku para ver los videos." }
    res = http("POST", "http://127.0.0.1:8060/launch/837?contentId=" + enc(r.vid) + "&mediaType=movie", "", invalid, 8000)
    if res.code >= 200 and res.code < 300 then return { ok: true }
    return { error: "No se pudo abrir YouTube (" + res.code.ToStr() + "). Revisa en el Roku: Configuración › Sistema › Configuración avanzada › Control por aplicaciones móviles › Acceso a la red: Predeterminado." }
end function

' ---------- Música libre (Audius) y radio (radio-browser.info) ----------
function cmdMusic(r as Object) as Object
    items = []
    if r.kind = "radio" then
        hosts = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://fi1.api.radio-browser.info"]
        path = "/json/stations/bycountrycodeexact/" + toS(r.cc) + "?order=clickcount&reverse=true&limit=120&hidebroken=true"
        if toS(r.q) <> "" then path = "/json/stations/byname/" + enc(r.q) + "?order=clickcount&reverse=true&limit=120&hidebroken=true"
        for each h in hosts
            res = httpJson("GET", h + path)
            if type(res.j) = "roArray" then
                for each st in res.j
                    u = toS(st.url_resolved)
                    if u = "" then u = toS(st.url)
                    if Left(u, 4) = "http" then items.Push({ t: "audio", n: toS(st.name).Trim(), p: toS(st.favicon), u: u, sub: toS(st.state), radio: true, hls: (st.hls = 1) })
                end for
                exit for
            end if
        end for
        return { items: items, key: r.rk }
    end if
    host = "https://api.audius.co"
    hr = httpJson("GET", "https://api.audius.co")
    if hr.j <> invalid and type(hr.j.data) = "roArray" and hr.j.data.Count() > 0 then host = toS(hr.j.data[0])
    path = "/v1/tracks/trending?time=week&app_name=MiVibraTV"
    if toS(r.genre) <> "" then path = path + "&genre=" + enc(r.genre)
    if toS(r.q) <> "" then path = "/v1/tracks/search?query=" + enc(r.q) + "&app_name=MiVibraTV"
    res = httpJson("GET", host + path)
    if res.j = invalid or type(res.j.data) <> "roArray" then return { error: "La música no respondió.", items: items, key: r.rk }
    for each x in res.j.data
        if x.is_streamable <> false then
            art = ""
            if x.artwork <> invalid then
                art = toS(x.artwork["480x480"])
                if art = "" then art = toS(x.artwork["150x150"])
            end if
            who = ""
            if x.user <> invalid then who = toS(x.user.name)
            items.Push({ t: "audio", n: toS(x.title), p: art, u: host + "/v1/tracks/" + toS(x.id) + "/stream?app_name=MiVibraTV", sub: who })
        end if
    end for
    return { items: items, key: r.rk }
end function

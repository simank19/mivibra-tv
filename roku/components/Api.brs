' Tarea en segundo plano: internet, cuenta MiVibra (Firebase), listas M3U / Xtream y el panel web.

sub init()
    m.top.functionName = "work"
end sub

sub work()
    r = m.top.req
    c = r.cmd
    out = invalid
    if c = "load" then
        out = cmdLoad(r)
    else if c = "login" then
        out = cmdLogin(r)
    else if c = "series" then
        out = cmdSeries(r)
    else if c = "push" then
        out = cmdPush(r)
    else if c = "inbox" then
        out = cmdInbox(r)
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
            body = FormatJson({ postBody: "id_token=" + t.j.id_token + "&providerId=google.com", requestUri: "http://localhost", returnSecureToken: true, returnIdpCredential: true })
            f = httpJson("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + cfg.apiKey, body, jsonHdr())
            if f.j = invalid or f.j.idToken = invalid then return { error: "Firebase no aceptó la cuenta. Revisa la configuración de MiVibra." }
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
    out.catalog = buildCatalog(lists, out.errors)
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
function buildCatalog(lists as Object, errors as Object) as Object
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

' Capítulos de una serie de Xtream
function cmdSeries(r as Object) as Object
    it = r.item
    api = it.h + "/player_api.php?username=" + enc(it.us) + "&password=" + enc(it.pw) + "&action=get_series_info&series_id=" + it.xs
    res = httpJson("GET", api)
    eps = []
    if res.j = invalid or res.j.episodes = invalid then return { error: "No se pudieron cargar los capítulos.", eps: eps }
    seasons = []
    for each k in res.j.episodes
        seasons.Push(Val(k, 10))
    end for
    seasons.Sort()
    for each sn in seasons
        arr = res.j.episodes[sn.ToStr()]
        if type(arr) = "roArray" then
            for each e in arr
                ext = toS(e.container_extension)
                if ext = "" then ext = "mp4"
                pic = ""
                if e.info <> invalid and e.info.movie_image <> invalid then pic = toS(e.info.movie_image)
                eps.Push({ n: toS(e.title), u: it.h + "/series/" + it.us + "/" + it.pw + "/" + toS(e.id) + "." + ext, s: sn, e: Val(toS(e.episode_num)), p: pic })
            end for
        end if
    end for
    return { eps: eps }
end function

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

' MiVibra TV para Roku: pantalla principal.

sub init()
    m.nav = m.top.FindNode("nav")
    m.groups = m.top.FindNode("groups")
    m.grid = m.top.FindNode("grid")
    m.eps = m.top.FindNode("eps")
    m.info = m.top.FindNode("info")
    m.title = m.top.FindNode("title")
    m.status = m.top.FindNode("status")
    m.video = m.top.FindNode("video")
    m.osd = m.top.FindNode("osd")
    m.kbd = m.top.FindNode("kbd")
    m.keyboard = m.top.FindNode("keyboard")
    m.searchBtn = m.top.FindNode("searchBtn")

    m.sections = [
        { id: "live", t: "TV en vivo" }
        { id: "movie", t: "Películas" }
        { id: "series", t: "Series" }
        { id: "favs", t: "Favoritos" }
        { id: "recent", t: "Continuar viendo" }
        { id: "search", t: "Buscar" }
        { id: "settings", t: "Ajustes" }
    ]
    nc = CreateObject("roSGNode", "ContentNode")
    for each s in m.sections
        c = nc.CreateChild("ContentNode")
        c.title = s.t
    end for
    m.nav.content = nc

    m.nav.ObserveField("itemFocused", "onNavFocus")
    m.nav.ObserveField("itemSelected", "onNavSelect")
    m.groups.ObserveField("itemFocused", "onGroupFocus")
    m.groups.ObserveField("itemSelected", "onGroupSelect")
    m.grid.ObserveField("itemSelected", "onGridSelect")
    m.grid.ObserveField("itemFocused", "onGridFocus")
    m.eps.ObserveField("itemSelected", "onEpSelect")
    m.video.ObserveField("state", "onVideoState")
    m.searchBtn.ObserveField("buttonSelected", "onSearchGo")
    m.top.FindNode("pollT").ObserveField("fire", "onPoll")
    m.top.FindNode("osdT").ObserveField("fire", "onOsdHide")
    m.top.FindNode("toastT").ObserveField("fire", "onToastHide")

    m.tasks = {}
    m.reqN = 0
    m.auth = regGet("auth", invalid)
    m.lists = regGet("lists", [])
    m.pid = regGet("pid", "")
    m.recent = regGet("recent", [])
    m.resume = regGet("resume", {})
    m.myFavs = regGet("favs", {})
    m.cat = { live: [], movie: [], series: [] }
    m.user = invalid
    m.groupsData = []
    m.gridItems = []
    m.gridBuilt = 0
    m.secIdx = 0
    m.sec = "live"
    m.backAt = 0
    m.playing = invalid
    m.loginTask = invalid
    m.counts = invalid

    m.nav.SetFocus(true)
    load()
    m.top.FindNode("pollT").control = "start"
end sub

' ---------- Tareas ----------
function api(req as Object, cb as String) as Object
    m.reqN = m.reqN + 1
    req.id = m.reqN
    t = CreateObject("roSGNode", "Api")
    t.req = req
    t.ObserveField("res", cb)
    m.tasks[m.reqN.ToStr()] = t
    t.control = "RUN"
    return t
end function

function done(ev as Object) as Object
    r = ev.GetData()
    if r <> invalid and r.id <> invalid then m.tasks.Delete(toS(r.id))
    return r
end function

' ---------- Mensajes ----------
sub toast(t as String)
    m.top.FindNode("toast").text = t
    m.top.FindNode("toastG").visible = true
    tm = m.top.FindNode("toastT")
    tm.control = "stop"
    tm.control = "start"
end sub

sub onToastHide()
    m.top.FindNode("toastG").visible = false
end sub

function fmtNum(n as Integer) as String
    s = n.ToStr()
    out = ""
    while Len(s) > 3
        out = "." + Right(s, 3) + out
        s = Left(s, Len(s) - 3)
    end while
    return s + out
end function

function countAll(arr as Object) as Integer
    n = 0
    for each g in arr
        n = n + g.n.Count()
    end for
    return n
end function

' ---------- Cargar listas ----------
sub load()
    m.status.text = "Cargando tus listas…"
    api({ cmd: "load", auth: m.auth, lists: m.lists, code: deviceCode() }, "onLoad")
end sub

sub onLoad(ev as Object)
    r = done(ev)
    if r = invalid then return
    if r.signedOut = true then
        m.auth = invalid
        regDel("auth")
        toast("La sesión se cerró. Vuelve a entrar desde Ajustes.")
    end if
    if r.auth <> invalid then
        m.auth = r.auth
        regSet("auth", r.auth)
    end if
    if r.lists <> invalid then
        m.lists = r.lists
        regSet("lists", m.lists)
    end if
    if r.user <> invalid then
        m.user = r.user
        pickProfile()
    end if
    m.denied = (r.denied = true)
    if r.catalog <> invalid then m.cat = r.catalog
    nl = countAll(m.cat.live)
    nm = countAll(m.cat.movie)
    ns = countAll(m.cat.series)
    m.counts = fmtNum(nl) + " canales · " + fmtNum(nm) + " películas · " + fmtNum(ns) + " series"
    m.status.text = m.counts
    if r.inbox <> invalid and r.inbox > 0 then
        toast("Llegó una lista desde el panel web")
    else if r.errors <> invalid and r.errors.Count() > 0 then
        toast(r.errors[0])
    end if
    if nl + nm + ns = 0 then
        m.nav.jumpToItem = 6
        showSection(6)
    else
        showSection(m.secIdx)
    end if
end sub

sub onPoll()
    if m.loginTask <> invalid then return
    api({ cmd: "inbox", code: deviceCode() }, "onInbox")
end sub

sub onInbox(ev as Object)
    r = done(ev)
    if r = invalid or r.got = invalid or r.got.Count() = 0 then return
    for each l in r.got
        m.lists.Push(l)
    end for
    regSet("lists", m.lists)
    toast("Llegó una lista desde el panel web: cargando…")
    load()
end sub

' ---------- Perfiles y datos de la cuenta ----------
sub pickProfile()
    ps = profiles()
    if ps.Count() = 0 then return
    for each p in ps
        if p.id = m.pid then return
    end for
    m.pid = ps[0].id
    regSet("pid", m.pid)
end sub

function profiles() as Object
    if m.user = invalid or type(m.user.profiles) <> "roArray" then return []
    out = []
    for each p in m.user.profiles
        if p <> invalid and p.id <> invalid then out.Push(p)
    end for
    return out
end function

function pdata() as Object
    if m.user = invalid or m.user.pdata = invalid or m.pid = "" then return {}
    d = m.user.pdata[m.pid]
    if d = invalid then return {}
    return d
end function

function profileName() as String
    for each p in profiles()
        if p.id = m.pid then return toS(p.name)
    end for
    return ""
end function

' Entrada guardada (favoritos / historial de otra app) → elemento que se puede abrir aquí
function fromMini(x as Object) as Object
    t = toS(x.type)
    if t = "" then t = "movie"
    p = toS(x.poster)
    if p = "" then p = toS(x.logo)
    it = { t: t, n: toS(x.name), u: toS(x.url), p: p, tvg: toS(x.tvg), key: toS(x.key) }
    if x.pos <> invalid then it.pos = x.pos
    if x.dur <> invalid then it.dur = x.dur
    if t = "series" and it.u = "" then
        s = findByName(m.cat.series, it.n)
        if s <> invalid then return s
    end if
    return it
end function

function findByName(groups as Object, name as String) as Dynamic
    k = norm(name)
    for each g in groups
        for each it in g.n
            if LCase(it.n) = LCase(name) then return it
        end for
    end for
    for each g in groups
        for each it in g.n
            if norm(it.n) = k then return it
        end for
    end for
    return invalid
end function

function sortTs(arr as Object) as Object
    ' De lo más nuevo a lo más viejo
    tmp = []
    for each x in arr
        ts = 0
        if x <> invalid and x.ts <> invalid then ts = x.ts
        if x <> invalid then tmp.Push({ k: ts, v: x })
    end for
    tmp.SortBy("k", "r")
    out = []
    for each t in tmp
        out.Push(t.v)
    end for
    return out
end function

function favGroups() as Object
    seen = {}
    all = []
    favs = pdata().favs
    if favs <> invalid then
        for each k in favs
            f = favs[k]
            if f <> invalid and f.del <> true then
                all.Push(f)
                seen[k] = true
            end if
        end for
    end if
    for each k in m.myFavs
        if not seen.DoesExist(k) then all.Push(m.myFavs[k])
    end for
    all = sortTs(all)
    live = []
    mov = []
    ser = []
    for each f in all
        it = fromMini(f)
        if it.t = "live" then
            live.Push(it)
        else if it.t = "series" then
            ser.Push(it)
        else
            mov.Push(it)
        end if
    end for
    out = []
    if live.Count() > 0 then out.Push({ g: "Canales", n: live })
    if mov.Count() > 0 then out.Push({ g: "Películas", n: mov })
    if ser.Count() > 0 then out.Push({ g: "Series", n: ser })
    return out
end function

function recentGroups() as Object
    d = pdata()
    cont = []
    if d.progress <> invalid then
        arr = []
        for each k in d.progress
            if d.progress[k] <> invalid then arr.Push(d.progress[k])
        end for
        for each x in sortTs(arr)
            cont.Push(fromMini(x))
        end for
    end if
    hist = []
    seen = {}
    src = []
    for each x in m.recent
        src.Push(x)
    end for
    if type(d.history) = "roArray" then
        for each x in d.history
            if x <> invalid then src.Push(x)
        end for
    end if
    for each x in sortTs(src)
        k = toS(x.key)
        if k <> "" and not seen.DoesExist(k) and hist.Count() < 80 then
            seen[k] = true
            hist.Push(fromMini(x))
        end if
    end for
    out = []
    if cont.Count() > 0 then out.Push({ g: "Continuar viendo", n: cont })
    if hist.Count() > 0 then out.Push({ g: "Vistos hace poco", n: hist })
    return out
end function

' ---------- Secciones ----------
sub onNavFocus()
    showSection(m.nav.itemFocused)
end sub

sub onNavSelect()
    i = m.nav.itemSelected
    if m.sections[i].id = "search" then
        openKbd()
        return
    end if
    if m.groups.content <> invalid and m.groups.content.GetChildCount() > 0 then m.groups.SetFocus(true)
end sub

sub showSection(i as Integer)
    if i < 0 or i >= m.sections.Count() then return
    s = m.sections[i]
    m.secIdx = i
    m.sec = s.id
    m.title.text = s.t
    if m.counts <> invalid then m.status.text = m.counts
    m.eps.visible = false
    m.info.visible = false
    m.grid.visible = true
    if s.id = "live" or s.id = "movie" or s.id = "series" then
        m.groupsData = m.cat[s.id]
        if m.groupsData = invalid then m.groupsData = []
    else if s.id = "favs" then
        m.groupsData = favGroups()
    else if s.id = "recent" then
        m.groupsData = recentGroups()
    else if s.id = "search" then
        if m.searchRes = invalid then m.searchRes = []
        m.groupsData = m.searchRes
    else if s.id = "settings" then
        showSettings()
        return
    end if
    gc = CreateObject("roSGNode", "ContentNode")
    for each g in m.groupsData
        c = gc.CreateChild("ContentNode")
        c.title = g.g + "  ·  " + fmtNum(g.n.Count())
    end for
    m.groups.content = gc
    if m.groupsData.Count() > 0 then
        fillGrid(0)
    else
        m.grid.content = CreateObject("roSGNode", "ContentNode")
        m.gridItems = []
        m.grid.visible = false
        m.info.visible = true
        if s.id = "favs" then
            m.info.text = "Aún no tienes favoritos." + Chr(10) + Chr(10) + "Sobre cualquier canal, película o serie presiona el botón * del control para agregarlo. Los favoritos de tu cuenta (celular, TV Android y PC) también aparecen aquí."
        else if s.id = "recent" then
            m.info.text = "Aquí aparece lo que vas viendo, también lo que viste en el celular, el TV Android o el PC con tu misma cuenta."
        else if s.id = "search" then
            m.info.text = "Presiona OK sobre Buscar para escribir el nombre de un canal, película o serie."
        else
            m.info.text = "Todavía no hay nada aquí." + Chr(10) + Chr(10) + "Agrega tu lista en Ajustes (con tu cuenta MiVibra o desde el panel web)."
        end if
    end if
end sub

sub onGroupFocus()
    if m.sec = "settings" then
        settingsInfo(m.groups.itemFocused)
        return
    end if
    fillGrid(m.groups.itemFocused)
end sub

sub onGroupSelect()
    if m.sec = "settings" then
        settingsAct(m.groups.itemSelected)
        return
    end if
    if m.grid.visible and m.gridItems.Count() > 0 then m.grid.SetFocus(true)
end sub

sub fillGrid(gi as Integer)
    if gi < 0 or gi >= m.groupsData.Count() then return
    m.eps.visible = false
    m.info.visible = false
    m.grid.visible = true
    m.gridItems = m.groupsData[gi].n
    m.gridBuilt = 0
    ' Canales: logos anchos · películas y series: carátulas verticales
    wide = (m.gridItems.Count() > 0 and m.gridItems[0].t = "live")
    if wide then
        m.grid.basePosterSize = [290, 163]
        m.grid.numColumns = 3
        m.grid.numRows = 3
    else
        m.grid.basePosterSize = [200, 300]
        m.grid.numColumns = 4
        m.grid.numRows = 2
    end if
    m.grid.content = CreateObject("roSGNode", "ContentNode")
    appendGrid(240)
end sub

' Las carátulas se crean de a poco (algunas categorías tienen miles)
sub appendGrid(n as Integer)
    root = m.grid.content
    last = m.gridBuilt + n - 1
    if last > m.gridItems.Count() - 1 then last = m.gridItems.Count() - 1
    if last < m.gridBuilt then return
    for i = m.gridBuilt to last
        it = m.gridItems[i]
        c = root.CreateChild("ContentNode")
        c.hdgridposterurl = toS(it.p)
        c.hdposterurl = toS(it.p)
        c.shortdescriptionline1 = toS(it.n)
        c.title = toS(it.n)
    end for
    m.gridBuilt = last + 1
end sub

sub onGridFocus()
    if m.grid.itemFocused > m.gridBuilt - 40 then appendGrid(240)
    i = m.grid.itemFocused
    if i >= 0 and i < m.gridItems.Count() then m.status.text = toS(m.gridItems[i].n)
end sub

sub onGridSelect()
    i = m.grid.itemSelected
    if i < 0 or i >= m.gridItems.Count() then return
    activate(m.gridItems[i], i)
end sub

sub activate(it as Object, idx as Integer)
    if it.t = "series" then
        openSeries(it)
    else if toS(it.u) = "" then
        toast("Este título no tiene enlace en tus listas de este Roku.")
    else
        play(it, m.gridItems, idx)
    end if
end sub

' ---------- Series ----------
sub openSeries(it as Object)
    m.curSeries = it
    if it.eps <> invalid then
        showEps(it.eps)
    else if it.xs <> invalid then
        m.status.text = "Cargando capítulos…"
        api({ cmd: "series", item: it }, "onSeries")
    else
        toast("No encuentro los capítulos de esta serie en tus listas.")
    end if
end sub

sub onSeries(ev as Object)
    r = done(ev)
    if r = invalid then return
    m.status.text = toS(m.curSeries.n)
    if r.error <> invalid or r.eps = invalid or r.eps.Count() = 0 then
        toast("No se pudieron cargar los capítulos.")
        return
    end if
    showEps(r.eps)
end sub

sub showEps(eps as Object)
    ' Orden: temporada y capítulo
    arr = []
    for each e in eps
        arr.Push({ k: e.s * 1000 + e.e, v: e })
    end for
    arr.SortBy("k")
    m.epsArr = []
    ec = CreateObject("roSGNode", "ContentNode")
    for each a in arr
        e = a.v
        m.epsArr.Push(e)
        c = ec.CreateChild("ContentNode")
        nm = toS(e.n)
        c.title = "T" + toS(Int(e.s)) + " · E" + toS(Int(e.e)) + "   " + nm
    end for
    m.eps.content = ec
    m.title.text = toS(m.curSeries.n)
    m.grid.visible = false
    m.info.visible = false
    m.eps.visible = true
    m.eps.SetFocus(true)
end sub

sub onEpSelect()
    i = m.eps.itemSelected
    if i < 0 or i >= m.epsArr.Count() then return
    playEp(i)
end sub

sub playEp(i as Integer)
    e = m.epsArr[i]
    sn = toS(m.curSeries.n)
    it = { t: "ep", n: sn + " · T" + toS(Int(e.s)) + " E" + toS(Int(e.e)), u: e.u, p: toS(m.curSeries.p), series: sn, s: e.s, e: e.e }
    play(it, m.epsArr, i)
end sub

' ---------- Reproductor ----------
function fmtOf(u as String) as String
    l = LCase(u)
    q = Instr(1, l, "?")
    if q > 0 then l = Left(l, q - 1)
    if Right(l, 5) = ".m3u8" or Right(l, 4) = ".m3u" then return "hls"
    if Right(l, 4) = ".mpd" then return "dash"
    if Right(l, 4) = ".mp4" or Right(l, 4) = ".m4v" or Right(l, 4) = ".mov" then return "mp4"
    if Right(l, 4) = ".mkv" then return "mkv"
    if Right(l, 4) = ".mp3" then return "mp3"
    return ""
end function

function itemKey(it as Object) as String
    if it.key <> invalid and it.key <> "" then return it.key
    if it.t = "live" then
        if toS(it.tvg) <> "" then return "live:" + LCase(it.tvg)
        return "live:" + norm(toS(it.n))
    else if it.t = "ep" then
        return "ep:" + norm(toS(it.series)) + ":" + toS(Int(it.s)) + ":" + toS(Int(it.e))
    end if
    return "movie:" + norm(toS(it.n))
end function

sub play(it as Object, list as Object, idx as Integer)
    c = CreateObject("roSGNode", "ContentNode")
    c.url = it.u
    c.title = it.n
    f = fmtOf(it.u)
    if f <> "" then c.streamFormat = f
    live = (it.t = "live")
    c.live = live
    if not live then
        k = itemKey(it)
        startMs = 0
        if m.resume[k] <> invalid then startMs = m.resume[k]
        if startMs = 0 and it.pos <> invalid then startMs = it.pos
        if startMs > 20000 then c.playStart = Int(startMs / 1000)
    end if
    m.video.content = c
    m.top.FindNode("vbg").visible = true
    m.video.visible = true
    m.video.SetFocus(true)
    m.video.control = "play"
    m.playing = { it: it, list: list, idx: idx }
    hint = "Atrás: salir"
    if live then hint = "▲ ▼ cambiar de canal · OK: nombre del canal · Atrás: salir"
    showOsd(it.n, hint)
end sub

sub showOsd(t as String, hint as String)
    m.top.FindNode("osdText").text = t
    m.top.FindNode("osdHint").text = hint
    m.osd.visible = true
    tm = m.top.FindNode("osdT")
    tm.control = "stop"
    tm.control = "start"
end sub

sub onOsdHide()
    m.osd.visible = false
end sub

sub zap(d as Integer)
    p = m.playing
    if p = invalid or p.list = invalid then return
    n = p.list.Count()
    if n < 2 then return
    i = (p.idx + d + n) mod n
    record(false)
    m.video.control = "stop"
    play(p.list[i], p.list, i)
end sub

sub onVideoState()
    st = m.video.state
    if st = "error" then
        msg = toS(m.video.errorMsg)
        closePlayer()
        toast("No se pudo reproducir. " + msg)
    else if st = "finished" then
        p = m.playing
        if p <> invalid and p.it.t = "ep" and p.idx + 1 < p.list.Count() then
            record(true)
            playEp(p.idx + 1)
        else
            closePlayer()
        end if
    end if
end sub

sub closePlayer()
    if m.playing = invalid then return
    record(false)
    m.video.control = "stop"
    m.video.visible = false
    m.top.FindNode("vbg").visible = false
    m.osd.visible = false
    m.playing = invalid
    if m.eps.visible then
        m.eps.SetFocus(true)
    else if m.grid.visible then
        m.grid.SetFocus(true)
    else
        m.nav.SetFocus(true)
    end if
end sub

' Historial, "Continuar viendo" y avance (en este Roku y en la cuenta)
sub record(ended as Boolean)
    p = m.playing
    if p = invalid then return
    it = p.it
    k = itemKey(it)
    posMs = Int(m.video.position * 1000)
    durMs = Int(m.video.duration * 1000)
    if ended then posMs = durMs
    t = it.t
    if t = "ep" then t = "movie"
    entry = { key: k, type: t, name: toS(it.n), logo: "", poster: toS(it.p), url: toS(it.u), group: "", tvg: toS(it.tvg), ia: "", ep: "", parent: "", ts: nowMs(), device: "Roku" }
    if it.t = "live" then
        entry.logo = toS(it.p)
        entry.poster = ""
    end if
    nr = [entry]
    for each x in m.recent
        if x.key <> k and nr.Count() < 60 then nr.Push(x)
    end for
    m.recent = nr
    regSet("recent", m.recent)
    live = (it.t = "live")
    if not live and durMs > 0 then
        if posMs > durMs * 0.95 or posMs < 20000 then
            m.resume.Delete(k)
        else
            m.resume[k] = posMs
        end if
        regSet("resume", m.resume)
    end if
    if m.auth <> invalid and m.pid <> "" then
        req = { cmd: "push", auth: m.auth, pid: m.pid, entry: entry }
        if not live and durMs > 0 then
            req.pos = posMs
            req.dur = durMs
        end if
        api(req, "onPush")
    end if
end sub

sub onPush(ev as Object)
    r = done(ev)
    if r = invalid then return
    if r.auth <> invalid then
        m.auth = r.auth
        regSet("auth", r.auth)
    end if
    if r.ok = true and m.user <> invalid and m.user.pdata <> invalid and m.pid <> "" then
        d = m.user.pdata[m.pid]
        if d = invalid then d = {}
        d.history = r.history
        d.progress = r.progress
        m.user.pdata[m.pid] = d
    end if
end sub

' ---------- Favoritos de este Roku (botón *) ----------
sub toggleFav()
    i = m.grid.itemFocused
    if i < 0 or i >= m.gridItems.Count() then return
    it = m.gridItems[i]
    k = itemKey(it)
    if m.myFavs.DoesExist(k) then
        m.myFavs.Delete(k)
        toast("Quitado de favoritos: " + toS(it.n))
    else
        t = it.t
        if t = "ep" then t = "movie"
        m.myFavs[k] = { key: k, type: t, name: toS(it.n), poster: toS(it.p), logo: toS(it.p), url: toS(it.u), tvg: toS(it.tvg), ts: nowMs() }
        toast("Agregado a favoritos: " + toS(it.n))
    end if
    regSet("favs", m.myFavs)
end sub

' ---------- Buscar ----------
sub openKbd()
    m.keyboard.text = ""
    m.kbd.visible = true
    m.keyboard.SetFocus(true)
end sub

sub closeKbd()
    m.kbd.visible = false
    m.nav.SetFocus(true)
end sub

sub onSearchGo()
    q = LCase(m.keyboard.text.Trim())
    m.kbd.visible = false
    if Len(q) < 2 then
        toast("Escribe al menos 2 letras")
        m.nav.SetFocus(true)
        return
    end if
    res = []
    names = { live: "Canales", movie: "Películas", series: "Series" }
    for each kind in ["live", "movie", "series"]
        found = []
        for each g in m.cat[kind]
            for each it in g.n
                if Instr(1, LCase(it.n), q) > 0 then
                    found.Push(it)
                    if found.Count() >= 300 then exit for
                end if
            end for
            if found.Count() >= 300 then exit for
        end for
        if found.Count() > 0 then res.Push({ g: names[kind], n: found })
    end for
    m.searchRes = res
    showSection(5)
    m.title.text = "Buscar: " + m.keyboard.text
    if res.Count() = 0 then
        m.info.text = "No encontré nada con “" + m.keyboard.text + "”." + Chr(10) + Chr(10) + "Presiona OK sobre Buscar para intentar otra vez."
        m.nav.SetFocus(true)
    else
        m.groups.SetFocus(true)
    end if
end sub

' ---------- Ajustes ----------
sub showSettings()
    m.grid.visible = false
    m.eps.visible = false
    m.info.visible = true
    items = []
    if m.auth <> invalid then
        items.Push({ id: "acct", t: "Mi cuenta" })
    else
        items.Push({ id: "login", t: "Entrar con el celular (código)" })
    end if
    items.Push({ id: "panel", t: "Agregar lista desde el panel web" })
    items.Push({ id: "reload", t: "Actualizar listas" })
    if profiles().Count() > 1 then items.Push({ id: "profile", t: "Cambiar perfil" })
    if m.lists.Count() > 0 then items.Push({ id: "clear", t: "Quitar las listas de este Roku" })
    if m.auth <> invalid then items.Push({ id: "logout", t: "Cerrar sesión" })
    items.Push({ id: "about", t: "Acerca de MiVibra TV" })
    m.setItems = items
    gc = CreateObject("roSGNode", "ContentNode")
    for each s in items
        c = gc.CreateChild("ContentNode")
        c.title = s.t
    end for
    m.groupsData = []
    m.groups.content = gc
    settingsInfo(0)
end sub

function panelText() as String
    c = deviceCode()
    return "En cualquier celular o computador entra a:" + Chr(10) + "simank19.github.io/mivibra-tv/panel" + Chr(10) + Chr(10) + "Escribe el código de este Roku:" + Chr(10) + Left(c, 4) + "-" + Right(c, 4) + Chr(10) + Chr(10) + "Pega tu enlace M3U o tu cuenta Xtream y toca Enviar. La lista llega sola en menos de un minuto."
end function

sub settingsInfo(i as Integer)
    if m.setItems = invalid or i < 0 or i >= m.setItems.Count() then return
    id = m.setItems[i].id
    t = ""
    if id = "login" then
        t = "Entra con la misma cuenta de Google que usas en el celular, el TV Android o el PC." + Chr(10) + Chr(10) + "Así llegan tus listas incluidas, tus perfiles, favoritos y Continuar viendo."
    else if id = "acct" then
        t = "Sesión iniciada con:" + Chr(10) + toS(m.auth.email)
        pn = profileName()
        if pn <> "" then t = t + Chr(10) + Chr(10) + "Perfil: " + pn
        if m.denied = true then t = t + Chr(10) + Chr(10) + "Tu cuenta aún no tiene acceso a las listas incluidas: pídeselo a quien te dio el servicio y toca Actualizar listas."
    else if id = "panel" then
        t = panelText()
    else if id = "reload" then
        t = "Vuelve a descargar tus listas y lo que cambió en tu cuenta." + Chr(10) + Chr(10) + "Listas de este Roku: " + m.lists.Count().ToStr()
    else if id = "profile" then
        t = "Perfil actual: " + profileName() + Chr(10) + Chr(10) + "Presiona OK para cambiar al siguiente."
    else if id = "clear" then
        t = "Quita las " + m.lists.Count().ToStr() + " listas que llegaron desde el panel web a este Roku. Las de tu cuenta no se tocan."
    else if id = "logout" then
        t = "Cierra la sesión en este Roku. Tus datos siguen en la cuenta."
    else if id = "about" then
        t = "MiVibra TV para Roku" + Chr(10) + "Reproductor de listas: no incluye ni vende contenido." + Chr(10) + Chr(10) + "Control: OK abre · * agrega a favoritos · ▲▼ cambia de canal mientras ves TV en vivo." + Chr(10) + Chr(10) + "Las listas, favoritos y Continuar viendo se sincronizan con tu cuenta MiVibra."
    end if
    m.info.text = t
end sub

sub settingsAct(i as Integer)
    if m.setItems = invalid or i < 0 or i >= m.setItems.Count() then return
    id = m.setItems[i].id
    if id = "login" then
        startLogin()
    else if id = "panel" then
        onPoll()
        toast("Revisando si ya llegó tu lista…")
    else if id = "reload" or id = "acct" then
        load()
    else if id = "profile" then
        ps = profiles()
        n = 0
        for j = 0 to ps.Count() - 1
            if ps[j].id = m.pid then n = j + 1
        end for
        if n >= ps.Count() then n = 0
        m.pid = ps[n].id
        regSet("pid", m.pid)
        toast("Perfil: " + toS(ps[n].name))
        settingsInfo(i)
    else if id = "clear" then
        m.lists = []
        regSet("lists", m.lists)
        toast("Listas quitadas")
        load()
    else if id = "logout" then
        m.auth = invalid
        m.user = invalid
        regDel("auth")
        toast("Sesión cerrada")
        load()
    end if
end sub

sub startLogin()
    if m.loginTask <> invalid then return
    m.info.text = "Pidiendo el código a Google…"
    m.loginTask = api({ cmd: "login" }, "onLogin")
    m.loginTask.ObserveField("prog", "onLoginProg")
end sub

sub onLoginProg(ev as Object)
    p = ev.GetData()
    if p = invalid or p.code = invalid then return
    url = toS(p.url)
    url = url.Replace("https://", "").Replace("http://", "")
    m.info.text = "1. En el celular abre:" + Chr(10) + url + Chr(10) + Chr(10) + "2. Escribe este código:" + Chr(10) + toS(p.code) + Chr(10) + Chr(10) + "3. Elige tu cuenta de Google. Este Roku entra solo."
end sub

sub onLogin(ev as Object)
    r = done(ev)
    m.loginTask = invalid
    if r = invalid then return
    if r.auth <> invalid then
        m.auth = r.auth
        regSet("auth", r.auth)
        toast("Sesión iniciada: " + toS(r.auth.email))
        load()
    else if r.error <> invalid and r.error <> "cancel" then
        toast(r.error)
        m.info.text = r.error
    end if
end sub

' ---------- Control remoto ----------
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false
    if m.video.visible then
        if key = "back" then
            closePlayer()
            return true
        end if
        if m.playing <> invalid and m.playing.it.t = "live" then
            if key = "up" then
                zap(-1)
                return true
            else if key = "down" then
                zap(1)
                return true
            else if key = "OK" then
                showOsd(m.playing.it.n, "▲ ▼ cambiar de canal · Atrás: salir")
                return true
            end if
        end if
        return false
    end if
    if m.kbd.visible then
        if key = "back" then
            closeKbd()
            return true
        else if key = "down" and m.keyboard.IsInFocusChain() then
            m.searchBtn.SetFocus(true)
            return true
        else if key = "up" and m.searchBtn.HasFocus() then
            m.keyboard.SetFocus(true)
            return true
        else if key = "play" then
            onSearchGo()
            return true
        end if
        return false
    end if
    if m.eps.HasFocus() then
        if key = "back" or key = "left" then
            m.eps.visible = false
            m.grid.visible = true
            m.title.text = m.sections[m.secIdx].t
            m.grid.SetFocus(true)
            return true
        end if
        return false
    end if
    if m.grid.HasFocus() then
        if key = "left" or key = "back" then
            m.groups.SetFocus(true)
            return true
        else if key = "options" then
            toggleFav()
            return true
        end if
        return false
    end if
    if m.groups.HasFocus() then
        if key = "right" and m.grid.visible and m.gridItems.Count() > 0 then
            m.grid.SetFocus(true)
            return true
        else if key = "left" or key = "back" then
            if m.loginTask <> invalid then
                m.loginTask.cancel = true
                m.loginTask = invalid
            end if
            m.nav.SetFocus(true)
            return true
        end if
        return false
    end if
    if m.nav.HasFocus() then
        if key = "right" then
            if m.groups.content <> invalid and m.groups.content.GetChildCount() > 0 then m.groups.SetFocus(true)
            return true
        else if key = "back" then
            if nowSec() - m.backAt <= 2 then
                m.top.exitApp = true
            else
                m.backAt = nowSec()
                toast("Presiona Atrás otra vez para salir")
            end if
            return true
        end if
    end if
    return false
end function

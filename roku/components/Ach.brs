' Logros y niveles (las mismas reglas de la app: misma XP, mismos niveles y medallas, guardado en el perfil de la cuenta).
' Ojo: las claves con mayúsculas (seriesDone, bestStreak…) se usan siempre entre comillas para que BrightScript no las pase a minúsculas.

function achXP() as Object
    return { movie: 100, episode: 30, series: 300, app5: 5, day: 20, badge: 50, appCap: 60 }
end function

function achNeed(n as Integer) as Integer
    return 50 * (n - 1) * n
end function

function achLvl(xp as Dynamic) as Integer
    if xp = invalid then xp = 0
    n = 1
    while xp >= achNeed(n + 1)
        n = n + 1
    end while
    return n
end function

function achTitle(n as Integer) as String
    t = "Novato"
    for each x in [[1, "Novato"], [3, "Espectador"], [6, "Cinéfilo"], [10, "Maratonista"], [15, "Experto"], [20, "Leyenda"], [30, "Leyenda MiVibra"]]
        if n >= x[0] then t = x[1]
    end for
    return t
end function

' [id, nombre, cómo se gana, estadística, meta]
function achBadges() as Object
    return [
        ["movie1", "Primera función", "Termina tu primera película", "movies", 1]
        ["movie10", "Cinéfilo", "Termina 10 películas", "movies", 10]
        ["movie50", "Butaca de oro", "Termina 50 películas", "movies", 50]
        ["movie100", "Crítico de cine", "Termina 100 películas", "movies", 100]
        ["ep1", "Primer capítulo", "Termina tu primer capítulo", "episodes", 1]
        ["ep25", "Maratón", "Termina 25 capítulos", "episodes", 25]
        ["ep100", "Sin dormir", "Termina 100 capítulos", "episodes", 100]
        ["ep500", "Adicto a las series", "Termina 500 capítulos", "episodes", 500]
        ["ser1", "Final de temporada", "Termina una serie completa", "seriesDone", 1]
        ["ser5", "Coleccionista", "Termina 5 series completas", "seriesDone", 5]
        ["ser20", "Leyenda de las series", "Termina 20 series completas", "seriesDone", 20]
        ["game15", "Calentando", "Juega 15 minutos (en la app del celular, TV Android o PC)", "gameMin", 15]
        ["game60", "Jugador", "Juega 1 hora", "gameMin", 60]
        ["game600", "Gamer de verdad", "Juega 10 horas", "gameMin", 600]
        ["game3000", "Maestro del control", "Juega 50 horas", "gameMin", 3000]
        ["app60", "Bienvenido a casa", "Usa MiVibra 1 hora", "appMin", 60]
        ["app600", "Habitual", "Usa MiVibra 10 horas", "appMin", 600]
        ["app3000", "De la casa", "Usa MiVibra 50 horas", "appMin", 3000]
        ["streak3", "Constante", "Entra 3 días seguidos", "bestStreak", 3]
        ["streak7", "Semana completa", "Entra 7 días seguidos", "bestStreak", 7]
        ["streak30", "Mes de película", "Entra 30 días seguidos", "bestStreak", 30]
        ["trailer1", "Avance", "Mira tu primer tráiler (en la app)", "trailers", 1]
        ["trailer20", "Antes de decidir", "Mira 20 tráileres", "trailers", 20]
        ["fb1", "Tu voz cuenta", "Envía un comentario desde Ajustes de la app", "feedback", 1]
        ["lvl5", "Nivel 5", "Llega al nivel 5", "level", 5]
        ["lvl10", "Nivel 10", "Llega al nivel 10", "level", 10]
        ["lvl20", "Nivel 20", "Llega al nivel 20", "level", 20]
    ]
end function

' Fecha como la escribe la app web (toDateString): "Sat Nov 14 2026"
function achDate(daysAgo = 0 as Integer) as String
    d = CreateObject("roDateTime")
    if daysAgo <> 0 then d.FromSeconds(d.AsSeconds() - daysAgo * 86400)
    d.ToLocalTime()
    mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    dd = d.GetDayOfMonth().ToStr()
    if Len(dd) < 2 then dd = "0" + dd
    return Left(d.GetWeekday(), 3) + " " + mo[d.GetMonth() - 1] + " " + dd + " " + d.GetYear().ToStr()
end function

function isTrue(v as Dynamic) as Boolean
    t = type(v)
    if t = "roBoolean" or t = "Boolean" then return v
    return false
end function

function achNum(v as Dynamic) as Dynamic
    if v = invalid then return 0
    t = type(v)
    if t = "roInt" or t = "Integer" or t = "roLongInteger" or t = "LongInteger" then return v
    if t = "roFloat" or t = "Float" or t = "roDouble" or t = "Double" then return Int(v)
    return 0
end function

' Deja el estado completo (lo que falte se crea en cero)
function achFix(a as Dynamic) as Object
    if type(a) <> "roAssociativeArray" then a = {}
    a["xp"] = achNum(a["xp"])
    if type(a["st"]) <> "roAssociativeArray" then a["st"] = {}
    if type(a["got"]) <> "roAssociativeArray" then a["got"] = {}
    if type(a["seen"]) <> "roAssociativeArray" then a["seen"] = {}
    for each k in ["movies", "episodes", "seriesDone", "gameMin", "appMin", "trailers", "feedback", "streak", "bestStreak"]
        a["st"][k] = achNum(a["st"][k])
    end for
    return a
end function

sub achGain(a as Object, n as Integer, why as String, notes as Object)
    if n = 0 then return
    before = achLvl(a["xp"])
    a["xp"] = a["xp"] + n
    if why <> "" then notes.Push({ k: "xp", n: n, s: why })
    after = achLvl(a["xp"])
    if after > before then notes.Push({ k: "lvl", t: "¡Subiste a nivel " + after.ToStr() + "!", s: achTitle(after) })
end sub

sub achCheck(a as Object, notes as Object)
    again = true
    while again
        again = false
        lv = achLvl(a["xp"])
        for each b in achBadges()
            if a["got"][b[0]] = invalid then
                v = 0
                if b[3] = "level" then v = lv else v = achNum(a["st"][b[3]])
                if v >= b[4] then
                    a["got"][b[0]] = nowMs()
                    notes.Push({ k: "badge", t: "¡Logro desbloqueado!", s: b[1] })
                    achGain(a, achXP().badge, "", notes)
                    again = true
                end if
            end if
        end for
    end while
end sub

sub achDay(a as Object, notes as Object)
    t = achDate(0)
    if toS(a["day"]) = t then return
    st = a["st"]
    if toS(a["day"]) = achDate(1) then st["streak"] = st["streak"] + 1 else st["streak"] = 1
    if st["streak"] > st["bestStreak"] then st["bestStreak"] = st["streak"]
    a["day"] = t
    why = "Visita del día"
    if st["streak"] > 1 then why = "Racha de " + st["streak"].ToStr() + " días"
    achGain(a, achXP().day, why, notes)
end sub

' Aplica un evento: { k: "movie", key } · { k: "ep", key, sk, last, name } · { k: "app", min } · { k: "day" }
sub achApply(a as Object, ev as Object, notes as Object)
    X = achXP()
    st = a["st"]
    seen = a["seen"]
    k = toS(ev.k)
    if k = "movie" then
        if seen[ev.key] = invalid then
            seen[ev.key] = 1
            st["movies"] = st["movies"] + 1
            achGain(a, X.movie, "Película terminada", notes)
        end if
    else if k = "ep" then
        if seen[ev.key] = invalid then
            seen[ev.key] = 1
            st["episodes"] = st["episodes"] + 1
            achGain(a, X.episode, "Capítulo terminado", notes)
            if isTrue(ev.last) and seen[ev.sk] = invalid then
                seen[ev.sk] = 1
                st["seriesDone"] = st["seriesDone"] + 1
                achGain(a, X.series, "Serie terminada: " + toS(ev.name), notes)
            end if
        end if
    else if k = "app" then
        old = st["appMin"]
        st["appMin"] = old + achNum(ev.min)
        blocks = Int(st["appMin"] / 5) - Int(old / 5)
        if blocks > 0 then
            t = achDate(0)
            if type(a["appDay"]) <> "roAssociativeArray" or toS(a["appDay"]["d"]) <> t then a["appDay"] = { "d": t, "xp": 0 }
            room = X.appCap - achNum(a["appDay"]["xp"])
            g = blocks * X.app5
            if g > room then g = room
            if g > 0 then
                a["appDay"]["xp"] = achNum(a["appDay"]["xp"]) + g
                achGain(a, g, "", notes)
            end if
        end if
    end if
    achDay(a, notes)
end sub

' Texto corto de los avisos (los +XP se suman en uno)
function achNoteText(notes as Object) as String
    xp = 0
    why = ""
    extra = []
    for each n in notes
        if n.k = "xp" then
            xp = xp + n.n
            why = n.s
        else
            extra.Push(n.t + " " + n.s)
        end if
    end for
    out = []
    if xp > 0 then out.Push("+" + xp.ToStr() + " XP · " + why)
    for each e in extra
        out.Push(e)
    end for
    return out.Join("   ·   ")
end function

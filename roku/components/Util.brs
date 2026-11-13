' Utilidades compartidas (se incluyen en la app y en las tareas).

' Datos de la cuenta MiVibra: los pone Shell en m.global (no van en la librería pública)
function mvConfig() as Object
    c = invalid
    if m.global <> invalid then c = m.global.mvcfg
    if c = invalid then c = { apiKey: "", projectId: "", tvClientId: "", tvClientSecret: "" }
    return c
end function

function nowSec() as Integer
    return CreateObject("roDateTime").AsSeconds()
end function

function nowMs() as LongInteger
    d = CreateObject("roDateTime")
    ms& = d.AsSeconds()
    return ms& * 1000 + d.GetMilliseconds()
end function

function toS(v as Dynamic) as String
    if v = invalid then return ""
    t = type(v)
    if t = "roString" or t = "String" then return v
    if t = "roBoolean" or t = "Boolean" then
        if v then return "true"
        return "false"
    end if
    if GetInterface(v, "ifToStr") <> invalid then return v.ToStr()
    return ""
end function

function isStr(v as Dynamic) as Boolean
    t = type(v)
    return t = "roString" or t = "String"
end function

' ---------- Registro (lo que queda guardado en el Roku) ----------
function regGet(k as String, def as Dynamic) as Dynamic
    sec = CreateObject("roRegistrySection", "mivibra")
    if not sec.Exists(k) then return def
    v = ParseJson(sec.Read(k))
    if v = invalid then return def
    return v
end function

sub regSet(k as String, v as Dynamic)
    sec = CreateObject("roRegistrySection", "mivibra")
    sec.Write(k, FormatJson(v))
    sec.Flush()
end sub

sub regDel(k as String)
    sec = CreateObject("roRegistrySection", "mivibra")
    sec.Delete(k)
    sec.Flush()
end sub

' Código de 8 caracteres del equipo (el mismo formato del panel web)
function deviceCode() as String
    c = regGet("code", "")
    if Len(c) = 8 then return c
    alph = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    c = ""
    for i = 1 to 8
        c = c + Mid(alph, Rnd(Len(alph)), 1)
    end for
    regSet("code", c)
    return c
end function

' ---------- Nombres comparables (igual que MV.norm de la app) ----------
function norm(s as String) as String
    t = LCase(s)
    acc = [["á", "a"], ["à", "a"], ["ä", "a"], ["â", "a"], ["ã", "a"], ["é", "e"], ["è", "e"], ["ë", "e"], ["ê", "e"], ["í", "i"], ["ì", "i"], ["ï", "i"], ["î", "i"], ["ó", "o"], ["ò", "o"], ["ö", "o"], ["ô", "o"], ["õ", "o"], ["ú", "u"], ["ù", "u"], ["ü", "u"], ["û", "u"], ["ñ", "n"], ["ç", "c"], ["Á", "a"], ["É", "e"], ["Í", "i"], ["Ó", "o"], ["Ú", "u"], ["Ñ", "n"]]
    for each a in acc
        t = t.Replace(a[0], a[1])
    end for
    q = CreateObject("roRegex", "\b(hd|fhd|uhd|4k|sd|hevc|h265|1080p?|720p?|backup|alt)\b", "")
    t = q.ReplaceAll(t, "")
    r = CreateObject("roRegex", "[^a-z0-9]+", "")
    t = r.ReplaceAll(t, " ")
    return t.Trim()
end function

' ---------- Firestore: valores con tipo <-> valores normales ----------
function fsVal(v as Dynamic) as Dynamic
    if v = invalid then return invalid
    if v.DoesExist("stringValue") then return v.stringValue
    if v.DoesExist("integerValue") then
        n = ParseJson(toS(v.integerValue))
        if n = invalid then return 0
        return n
    end if
    if v.DoesExist("doubleValue") then return v.doubleValue
    if v.DoesExist("booleanValue") then return v.booleanValue
    if v.DoesExist("timestampValue") then return v.timestampValue
    if v.DoesExist("mapValue") then
        f = v.mapValue.fields
        if f = invalid then return {}
        return fsMap(f)
    end if
    if v.DoesExist("arrayValue") then
        out = []
        vals = v.arrayValue.values
        if vals <> invalid then
            for each x in vals
                out.Push(fsVal(x))
            end for
        end if
        return out
    end if
    return invalid
end function

function fsMap(fields as Object) as Object
    o = {}
    if fields = invalid then return o
    for each k in fields
        o[k] = fsVal(fields[k])
    end for
    return o
end function

function fsEnc(x as Dynamic) as Object
    t = type(x)
    if x = invalid then return { "nullValue": invalid }
    if t = "roString" or t = "String" then return { "stringValue": x }
    if t = "roBoolean" or t = "Boolean" then return { "booleanValue": x }
    if t = "roInt" or t = "Integer" or t = "roLongInteger" or t = "LongInteger" then return { "integerValue": x.ToStr() }
    if t = "roFloat" or t = "Float" or t = "roDouble" or t = "Double" then return { "doubleValue": x }
    if t = "roArray" then
        vals = []
        for each y in x
            vals.Push(fsEnc(y))
        end for
        return { "arrayValue": { "values": vals } }
    end if
    if t = "roAssociativeArray" then
        f = {}
        for each k in x
            f[k] = fsEnc(x[k])
        end for
        return { "mapValue": { "fields": f } }
    end if
    return { "nullValue": invalid }
end function

' ---------- Grupos +18: nunca se muestran en Roku ----------
function isAdultGroup(g as String) as Boolean
    r = CreateObject("roRegex", "adult|xxx|\+ ?18|porn|erotic|er[oó]tic|hentai|playboy|hustler|brazzers", "i")
    return r.IsMatch(g)
end function

' Actualización automática: la app se descarga de internet cada vez que se abre.
' Si en 12 segundos no llega (sin internet, GitHub caído…), se abre la copia instalada.

sub init()
    m.global.AddFields({ mvcfg: mvConfigPkg() })
    m.app = invalid
    url = libUrl()
    if url = "" then
        startApp(false)
    else
        loadLib(url)
    end if
end sub

sub loadLib(url as String)
    m.lib = CreateObject("roSGNode", "ComponentLibrary")
    m.lib.id = "MVLib"
    m.lib.ObserveField("loadStatus", "onLib")
    m.lib.uri = url + "?v=" + CreateObject("roDateTime").AsSeconds().ToStr()
    m.top.AppendChild(m.lib)
    t = m.top.FindNode("libT")
    t.ObserveField("fire", "onLibTimeout")
    t.control = "start"
end sub

function libUrl() as String
    ' Para probar se puede cambiar desde el registro (clave "libUrl"); "off" usa siempre la copia instalada
    sec = CreateObject("roRegistrySection", "mivibra")
    if sec.Exists("libUrl") then
        u = sec.Read("libUrl")
        if u = "off" then return ""
        return u
    end if
    return "https://simank19.github.io/mivibra-tv/roku/lib.zip"
end function

sub onLib()
    st = m.lib.loadStatus
    if st = "ready" then
        startApp(true)
    else if st = "failed" then
        startApp(false)
    end if
end sub

sub onLibTimeout()
    startApp(false)
end sub

sub startApp(remote as Boolean)
    if m.app <> invalid then return
    m.top.FindNode("libT").control = "stop"
    app = invalid
    if remote then
        app = m.top.CreateChild("MVLib:MVApp")
        if app <> invalid then
            app.apiName = "MVLib:Api"
            app.libInfo = "actualizada desde internet"
        end if
    end if
    if app = invalid then
        app = m.top.CreateChild("MVApp")
        app.apiName = "Api"
        app.libInfo = "copia instalada"
    end if
    m.app = app
    m.top.FindNode("splash").visible = false
    app.ObserveField("exitApp", "onExit")
    app.go = true
end sub

sub onExit()
    if m.app.exitApp then m.top.exitApp = true
end sub

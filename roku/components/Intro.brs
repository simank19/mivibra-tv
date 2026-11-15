' Intro de vidrio con logos (la misma que la app): MiVibra TV › "Todo en un solo lugar" con las plataformas
' › "Tus juegos" con las consolas › tarjeta final. OK o Atrás la saltan. Las imágenes llegan de GitHub Pages.

function mvImg() as String
    return "https://simank19.github.io/mivibra-tv/roku/img/"
end function

function ivNode(parent as Object, kind as String, f as Object) as Object
    n = parent.CreateChild(kind)
    m.ivN = m.ivN + 1
    n.id = "iv" + m.ivN.ToStr()
    n.SetFields(f)
    return n
end function

function ivFont(size as Integer, bold as Boolean) as Object
    f = CreateObject("roSGNode", "Font")
    if bold then f.uri = "font:BoldSystemFontFile" else f.uri = "font:SystemFontFile"
    f.size = size
    return f
end function

' Tarjeta de vidrio con un logo centrado
function ivTile(parent as Object, x as Integer, y as Integer, w as Integer, h as Integer, uri as String, lw as Integer, lh as Integer) as Object
    g = ivNode(parent, "Group", { translation: [x, y], scaleRotateCenter: [w / 2, h / 2] })
    ivNode(g, "Poster", { uri: mvImg() + "tile.9.png", width: w, height: h })
    if uri <> "" then ivNode(g, "Poster", { uri: uri, width: lw, height: lh, translation: [(w - lw) / 2, (h - lh) / 2], loadDisplayMode: "scaleToFit" })
    return g
end function

' Interpoladores (las horas van en segundos; la animación dura m.ivT)
sub ivKeys(node as Object, field as String, kind as String, times as Object, vals as Object)
    it = ivNode(m.ivAnim, kind, {})
    k = []
    for each t in times
        f = t / m.ivT
        if f < 0 then f = 0
        if f > 1 then f = 1
        k.Push(f)
    end for
    it.key = k
    it.keyValue = vals
    it.fieldToInterp = node.id + "." + field
end sub

sub ivFade(node as Object, times as Object, vals as Object)
    ivKeys(node, "opacity", "FloatFieldInterpolator", times, vals)
end sub

sub ivMove(node as Object, times as Object, vals as Object)
    ivKeys(node, "translation", "Vector2DFieldInterpolator", times, vals)
end sub

sub ivScale(node as Object, times as Object, vals as Object)
    ivKeys(node, "scale", "Vector2DFieldInterpolator", times, vals)
end sub

' Aparece subiendo un poco: a los t segundos, durante d
sub ivRise(node as Object, x as Integer, y as Integer, t as Float, d as Float, dy as Integer)
    node.opacity = 0
    ivFade(node, [0, t, t + d, m.ivT], [0, 0, 1, 1])
    ivMove(node, [0, t, t + d * 0.6, t + d, m.ivT], [[x, y + dy], [x, y + dy], [x, y + 4], [x, y], [x, y]])
end sub

function introOn() as Boolean
    return regGet("intro", true) = true
end function

sub playIntro()
    root = m.top.FindNode("intro")
    if root = invalid then return
    root.RemoveChildrenIndex(root.GetChildCount(), 0)
    m.ivN = 0
    m.ivT = 11.3
    W = 1920
    img = mvImg()

    ivNode(root, "Rectangle", { width: W, height: 1080, color: "0x45484CFF" })
    ivNode(root, "Poster", { uri: img + "bg.jpg", width: W, height: 1080 })
    m.ivAnim = ivNode(root, "Animation", { duration: m.ivT, easeFunction: "linear", repeat: false })

    ' 1 · Isotipo en vidrio
    s1 = ivNode(root, "Group", {})
    ivFade(s1, [0, 0.15, 0.6, 1.8, 2.1, m.ivT], [0, 0, 1, 1, 0, 0])
    tile = ivNode(s1, "Group", { translation: [850, 380], scaleRotateCenter: [110, 110] })
    ivNode(tile, "Poster", { uri: img + "glass.9.png", width: 220, height: 220 })
    ivNode(tile, "Poster", { uri: img + "isotipo.png", width: 150, height: 150, translation: [35, 35], loadDisplayMode: "scaleToFit" })
    ivScale(tile, [0, 0.15, 0.7, 0.9, m.ivT], [[0.6, 0.6], [0.6, 0.6], [1.04, 1.04], [1, 1], [1, 1]])
    cap = ivNode(s1, "Label", { text: "M I V I B R A    T V", width: W, horizAlign: "center", translation: [0, 640], color: "0xEEF0F2FF", font: ivFont(34, true) })
    ivRise(cap, 0, 640, 0.7, 0.5, 20)

    ' 2 · Todo en un solo lugar
    s2 = ivNode(root, "Group", {})
    s2.opacity = 0
    ivFade(s2, [0, 2.1, 2.4, 6.0, 6.3, m.ivT], [0, 0, 1, 1, 0, 0])
    h2 = ivNode(s2, "Label", { text: "Todo en un solo lugar", width: W, horizAlign: "center", color: "0xFFFFFFFF", font: ivFont(72, true) })
    ivRise(h2, 0, 170, 2.2, 0.5, 30)
    brands = ["netflix", "prime", "disney", "max", "crunchyroll", "youtube", "twitch", "kick", "vix", "pluto"]
    for i = 0 to brands.Count() - 1
        c = i mod 5
        r = Int(i / 5)
        x = 162 + c * 324
        y = 330 + r * 160
        t = ivTile(s2, x, y, 300, 136, img + "b/" + brands[i] + ".png", 220, 76)
        ivRise(t, x, y, 2.45 + i * 0.12, 0.45, 40)
    end for
    secs = ["TV en vivo", "Películas", "Series", "Anime", "Música", "Lectura"]
    px = 300
    for i = 0 to secs.Count() - 1
        pw = 200
        p = ivNode(s2, "Group", {})
        ivNode(p, "Poster", { uri: img + "glass.9.png", width: pw, height: 64 })
        ivNode(p, "Label", { text: secs[i], width: pw, height: 64, horizAlign: "center", vertAlign: "center", color: "0xEEF0F2FF", font: ivFont(28, false) })
        ivRise(p, px + i * 224, 720, 3.7 + i * 0.1, 0.4, 24)
    end for

    ' 3 · Tus juegos (consolas en dos carriles que se cruzan)
    s3 = ivNode(root, "Group", {})
    s3.opacity = 0
    ivFade(s3, [0, 6.3, 6.6, 8.7, 9.0, m.ivT], [0, 0, 1, 1, 0, 0])
    big = ivNode(s3, "Label", { text: "Tus juegos", width: W, horizAlign: "center", color: "0xFFFFFFFF", font: ivFont(120, true) })
    ivRise(big, 0, 190, 6.35, 0.5, 30)
    sm = ivNode(s3, "Label", { text: "D E   C U A L Q U I E R   C O N S O L A ,   E N   C U A L Q U I E R   E Q U I P O", width: W, horizAlign: "center", color: "0xD6D9DCFF", font: ivFont(26, true) })
    ivRise(sm, 0, 360, 6.55, 0.5, 20)
    lanes = [["snes", "n64", "gba", "nds", "wii", "gc", "gb", "nes", "snes", "n64"], ["psx", "ps2", "psp", "md", "saturn", "dc", "neogeo", "arcade", "psx", "ps2"]]
    for li = 0 to 1
        lane = ivNode(s3, "Group", {})
        for j = 0 to lanes[li].Count() - 1
            ivTile(lane, j * 248, 0, 224, 132, img + "c/" + lanes[li][j] + ".png", 170, 92)
        end for
        y = 500 + li * 170
        if li = 0 then
            ivMove(lane, [0, 6.3, 9.0, m.ivT], [[60, y], [60, y], [-420, y], [-420, y]])
        else
            ivMove(lane, [0, 6.3, 9.0, m.ivT], [[-460, y], [-460, y], [20, y], [20, y]])
        end if
    end for

    ' 4 · Tarjeta final
    s4 = ivNode(root, "Group", { scaleRotateCenter: [960, 540] })
    s4.opacity = 0
    ivFade(s4, [0, 9.0, 9.45, m.ivT], [0, 0, 1, 1])
    ivScale(s4, [0, 9.0, 9.6, m.ivT], [[0.92, 0.92], [0.92, 0.92], [1, 1], [1, 1]])
    ivNode(s4, "Poster", { uri: img + "glass.9.png", width: 780, height: 440, translation: [570, 320] })
    mini = ivNode(s4, "Group", { translation: [900, 360] })
    ivNode(mini, "Poster", { uri: img + "tile.9.png", width: 120, height: 120 })
    ivNode(mini, "Poster", { uri: img + "isotipo.png", width: 84, height: 84, translation: [18, 18], loadDisplayMode: "scaleToFit" })
    ivNode(s4, "Label", { text: "MiVibra TV", width: W, horizAlign: "center", translation: [0, 510], color: "0xFFFFFFFF", font: ivFont(82, true) })
    ivNode(s4, "Label", { text: "Tu entretenimiento, a tu manera", width: W, horizAlign: "center", translation: [0, 620], color: "0xD6D9DCFF", font: ivFont(34, false) })
    bar = ivNode(s4, "Rectangle", { width: 0, height: 4, color: "0xF4F5F6FF", translation: [860, 690] })
    ivKeys(bar, "width", "FloatFieldInterpolator", [0, 9.5, 10.4, m.ivT], [0, 0, 200, 200])

    ' Avance y "OK Saltar"
    for d = 0 to 3
        ivNode(root, "Rectangle", { width: 44, height: 6, color: "0xFFFFFF40", translation: [80 + d * 56, 1010] })
        dot = ivNode(root, "Rectangle", { width: 0, height: 6, color: "0xFFFFFFFF", translation: [80 + d * 56, 1010] })
        st = [0.15, 2.1, 6.3, 9.0, 11.3]
        ivKeys(dot, "width", "FloatFieldInterpolator", [0, st[d], st[d + 1], m.ivT], [0, 0, 44, 44])
    end for
    ok = ivNode(root, "Group", { translation: [1640, 984] })
    ivNode(ok, "Poster", { uri: img + "glass.9.png", width: 78, height: 52 })
    ivNode(ok, "Label", { text: "OK", width: 78, height: 52, horizAlign: "center", vertAlign: "center", color: "0xFFFFFFFF", font: ivFont(24, true) })
    ivNode(ok, "Label", { text: "Saltar", translation: [96, 0], height: 52, vertAlign: "center", color: "0xEEF0F2FF", font: ivFont(28, false) })

    root.visible = true
    root.SetFocus(true)
    m.ivAnim.control = "start"
    tm = m.top.FindNode("introT")
    tm.ObserveField("fire", "endIntro")
    tm.control = "start"
end sub

sub endIntro()
    root = m.top.FindNode("intro")
    if root = invalid or not root.visible then return
    m.top.FindNode("introT").control = "stop"
    if m.ivAnim <> invalid then m.ivAnim.control = "stop"
    root.visible = false
    root.RemoveChildrenIndex(root.GetChildCount(), 0)
    m.ivAnim = invalid
    m.nav.SetFocus(true)
end sub

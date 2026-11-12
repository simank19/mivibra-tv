' MiVibra TV para Roku: arranca la escena principal y espera a que se cierre.
sub Main(args as Dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.SetMessagePort(port)
    scene = screen.CreateScene("MainScene")
    screen.Show()
    scene.ObserveField("exitApp", port)
    while true
        msg = wait(0, port)
        t = type(msg)
        if t = "roSGScreenEvent" then
            if msg.IsScreenClosed() then return
        else if t = "roSGNodeEvent" then
            if msg.GetField() = "exitApp" then return
        end if
    end while
end sub

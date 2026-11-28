public class Probe {
    public static void main(String[] a) throws Throwable {
        System.out.println("PROBE cargando " + a[0]);
        System.load(a[0]);
        System.out.println("PROBE cargada");
        Object r = org.drinkless.tdlib.Client.execute(new org.drinkless.tdlib.TdApi.GetOption("version"));
        System.out.println("PROBE version " + r);
        org.drinkless.tdlib.Client c = org.drinkless.tdlib.Client.create(o -> System.out.println("PROBE update " + o.getClass().getSimpleName()), null, null);
        Thread.sleep(4000);
        System.out.println("PROBE fin");
        System.exit(0);
    }
}
// prueba sin loadLibrary estático

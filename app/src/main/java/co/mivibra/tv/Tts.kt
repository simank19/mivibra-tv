package co.mivibra.tv

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Lectura en voz alta con el motor de voz de Android (para el lector de libros). */
object Tts {
    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var ready = false
    private val waiting = ConcurrentHashMap<String, (Boolean, String?) -> Unit>()

    @Synchronized private fun ensure(ctx: Context): TextToSpeech {
        tts?.let { if (ready) return it }
        val latch = CountDownLatch(1)
        val t = TextToSpeech(ctx.applicationContext) { st -> ready = st == TextToSpeech.SUCCESS; latch.countDown() }
        latch.await(8, TimeUnit.SECONDS)
        if (!ready) { try { t.shutdown() } catch (e: Exception) {}; throw IllegalStateException("Este equipo no tiene un motor de voz. Instala \"Speech Services by Google\" desde la tienda.") }
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { id?.let { waiting.remove(it)?.invoke(true, null) } }
            @Deprecated("") override fun onError(id: String?) { id?.let { waiting.remove(it)?.invoke(false, "error") } }
            override fun onError(id: String?, code: Int) { id?.let { waiting.remove(it)?.invoke(false, "error $code") } }
            override fun onStop(id: String?, interrupted: Boolean) { id?.let { waiting.remove(it)?.invoke(false, "interrupted") } }
        })
        tts = t
        return t
    }

    fun speak(ctx: Context, id: String, text: String, lang: String, rate: Double, voice: String, done: (Boolean, String?) -> Unit) {
        val t = ensure(ctx)
        val v = if (voice.isNotBlank()) t.voices?.firstOrNull { it.name == voice } else null
        if (v != null) t.voice = v else t.language = Locale.forLanguageTag(lang.ifBlank { "es-ES" })
        t.setSpeechRate(rate.toFloat().coerceIn(0.3f, 3f))
        waiting.values.forEach { it(false, "interrupted") }; waiting.clear()
        waiting[id] = done
        val r = t.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id)
        if (r != TextToSpeech.SUCCESS) { waiting.remove(id); done(false, "No se pudo leer en voz alta") }
    }

    fun stop() { try { waiting.clear(); tts?.stop() } catch (e: Exception) {} }

    fun voices(ctx: Context): JSONArray {
        val t = ensure(ctx); val out = JSONArray()
        (t.voices ?: emptySet()).filter { !it.features.contains("notInstalled") }.sortedBy { it.locale.toLanguageTag() }.forEach {
            out.put(JSONObject().put("name", it.name).put("lang", it.locale.toLanguageTag()).put("local", !it.isNetworkConnectionRequired))
        }
        return out
    }
}

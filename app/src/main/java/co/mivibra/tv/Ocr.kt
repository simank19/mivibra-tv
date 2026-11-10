package co.mivibra.tv

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

/** Lee el texto de una foto o captura de una lista (enlaces, usuarios, contraseñas, MAC). Llamar fuera del hilo principal. */
object Ocr {
    private fun run(img: InputImage): String {
        val rec = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            val r = Tasks.await(rec.process(img))
            // Una línea por renglón detectado, en orden de arriba hacia abajo
            return r.textBlocks.sortedBy { it.boundingBox?.top ?: 0 }
                .flatMap { b -> b.lines.map { it.text } }
                .joinToString("\n") { fix(it) }
        } finally { rec.close() }
    }

    /** Arreglos comunes del reconocimiento en enlaces y MAC. */
    private fun fix(line: String): String {
        var t = line.trim()
        t = t.replace(Regex("(?i)h\\s*t\\s*t\\s*p\\s*(s?)\\s*:\\s*/\\s*/"), "http$1://")
        // MAC con O en vez de 0
        t = Regex("(?i)\\b([0-9A-FO]{2}[:-]){5}[0-9A-FO]{2}\\b").replace(t) { m -> m.value.uppercase().replace('O', '0') }
        return t
    }

    fun fromUri(ctx: Context, uri: Uri): String = run(InputImage.fromFilePath(ctx, uri))

    fun fromFile(f: File): String {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.path, opts)
        var sample = 1
        while (opts.outWidth / sample > 3000 || opts.outHeight / sample > 3000) sample *= 2
        val bmp = BitmapFactory.decodeFile(f.path, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: throw IllegalArgumentException("La imagen no se pudo abrir")
        return run(InputImage.fromBitmap(bmp, 0))
    }
}

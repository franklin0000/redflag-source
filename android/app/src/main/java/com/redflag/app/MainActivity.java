package com.redflag.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.telephony.TelephonyManager;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(VoiceBridge.class);
    }
}

@CapacitorPlugin(name = "VoiceBridge")
class VoiceBridge extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private SpeechRecognizer speechRecognizer;
    private boolean ttsInitialized = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            tts.setLanguage(new Locale("es", "ES"));
            ttsInitialized = true;
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (ttsInitialized && text != null) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "UtteranceId");
            call.resolve();
        } else {
            call.reject("TTS not initialized or empty text");
        }
    }

    @PluginMethod
    public void listen(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-ES");

            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) {
                        JSObject ret = new JSObject();
                        ret.put("value", matches.get(0));
                        call.resolve(ret);
                    } else {
                        call.reject("No results");
                    }
                }

                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onError(int error) { call.reject("Error code: " + error); }
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}
            });

            speechRecognizer.startListening(intent);
        });
    }

    @PluginMethod
    public void callEmergency(PluginCall call) {
        TelephonyManager tm = (TelephonyManager) getContext().getSystemService(getContext().TELEPHONY_SERVICE);
        String number = "911"; // Default
        
        // In a real app, we would use tm.getEmergencyNumberList() on API 29+
        // For now, we'll use the default or common ones.
        
        Intent intent = new Intent(Intent.ACTION_CALL);
        intent.setData(Uri.parse("tel:" + number));
        
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Permission denied: CALL_PHONE");
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
        }
        super.handleOnDestroy();
    }
}

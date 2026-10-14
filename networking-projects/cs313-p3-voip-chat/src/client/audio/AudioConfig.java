package client.audio;

import javax.sound.sampled.AudioFormat;

/**
 * Utility class for AudioFormat
 */
public class AudioConfig {

    /**
     * Returns the required audio format
     * 8000 Hz, 16-bit, Mono.
     * * @return AudioFormat instance
     */
    public static AudioFormat getFormat() {
        Float sampleRate = 8000.0f; //8000Hz
        int sampleSizeInBits = 16;  //16-bit
        int channels = 1;           //Mono
        boolean signed = true;      //signed data
        boolean bigEndian = false;  //little-endian

        return new AudioFormat(sampleRate, sampleSizeInBits, channels, signed, bigEndian);
    }
}

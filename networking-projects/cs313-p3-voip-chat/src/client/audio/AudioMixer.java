package client.audio;

import java.util.List;

/**
 * Utility class to mix multiple incoming audio streams for group calls.
 */
public class AudioMixer {

    /**
     * Mathematically mixes two 16-bit audio byte arrays together.
     * Prevents audio distortion (clipping) by clamping the volume.
     */
    public static byte[] mixTwoStreams(byte[] streamA, byte[] streamB) {
        
        // If one stream is empty, just return the other one
        if (streamA == null) {
            return streamB;
        }
        if (streamB == null) {
            return streamA;
        }

        // The array that will hold our combined audio
        byte[] mixedStream = new byte[streamA.length];

        // Step through the arrays 2 bytes at a time (since it is 16-bit audio)
        for (int i = 0; i < streamA.length; i += 2) {
            
            // 1. Reconstruct the 16-bit sound wave values from the raw bytes (Little Endian format)
            short sampleA = (short) ((streamA[i + 1] << 8) | (streamA[i] & 0xFF));
            short sampleB = (short) ((streamB[i + 1] << 8) | (streamB[i] & 0xFF));

            // 2. Add the sound waves together
            int combinedSample = sampleA + sampleB;

            // 3. Clamp the values! (Prevents terrible static and distortion)
            if (combinedSample > Short.MAX_VALUE) {
                combinedSample = Short.MAX_VALUE;
            } else if (combinedSample < Short.MIN_VALUE) {
                combinedSample = Short.MIN_VALUE;
            }

            // 4. Split the combined 16-bit value back into 2 raw bytes for the speaker
            mixedStream[i] = (byte) (combinedSample & 0xFF);
            mixedStream[i + 1] = (byte) ((combinedSample >> 8) & 0xFF);
        }

        return mixedStream;
    }

    /**
     * Takes a list of multiple audio streams and mixes them all into on single stream
     */
    public static byte[] mixMultipleStreams(List<byte[]> allStreams) {
        //If the list is null or empty, return null
        if (allStreams == null || allStreams.isEmpty()) {
            return null;
        }

        //Grab the first stream from the list to use as base finalMix
        byte[] finalMix = allStreams.get(0);

        //Loop through the remaining streams and mix them in sequentially
        for (int i = 1; i < allStreams.size(); i++) {
            finalMix = mixTwoStreams(finalMix, allStreams.get(i));
        }

        //Return the final, fully combined audio stream
        return finalMix;
    }
}

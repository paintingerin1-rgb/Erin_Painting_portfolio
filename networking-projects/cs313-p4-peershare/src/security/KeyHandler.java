package security;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

public class KeyHandler {

    /**
     * Converts a PublicKey object into a Base64 string.
     * This is used so the client can send its key to the server.
     */
    public static String publicKeyToString(PublicKey key) {
        // get the raw byte array of the key and encode it to Base64
        return Base64.getEncoder().encodeToString(key.getEncoded());
    }

    /**
     * Converts a Base64 String back into a PublicKey object.
     * Used when receiving a peer's key from the Server.
     */
    public static PublicKey stringToPublicKey(String keyStr) throws Exception {
        // Decode the Base64 string back into bytes
        byte[] keyBytes = Base64.getDecoder().decode(keyStr);
        
        // Generate the PublicKey object using the RSA algorithm
        X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
        KeyFactory kf = KeyFactory.getInstance("RSA");
        return kf.generatePublic(spec);
    }
}
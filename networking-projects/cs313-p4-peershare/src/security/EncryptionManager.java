package security;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Manages RSA and AES encryption for the P2P network.
 * Requirements addressed: 
 * - Encrypting message-keys 
 * - Encrypting messages 
 * - Handling Private/Public key pairs 
 */
public class EncryptionManager {

    private PrivateKey privateKey;
    private PublicKey publicKey;

    public EncryptionManager() throws Exception {
        generateKeys();
    }

    /**
     * This ensures decryption requires a separate private key.
     */
    private void generateKeys() throws Exception {
        // Initialize the KeyPairGenerator for the RSA algorithm
        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        
        // SecureRandom provides high-quality randomness for the keys
        SecureRandom random = SecureRandom.getInstanceStrong();
        
        // 2048 bits is the standard for secure RSA encryption
        keyGen.initialize(2048, random);
        
        // Generate the pair and assign them to our class variables
        KeyPair pair = keyGen.generateKeyPair();
        this.privateKey = pair.getPrivate();
        this.publicKey = pair.getPublic();
        
        System.out.println("Security System: RSA Key Pair generated successfully.");

    }

    /**
     * Encrypts a string (specifically the 'message-key') using a recipient's 
     * Public Key. Fulfills the requirement to secure keys during introduction.
     */
    public String encryptMessageKey(String messageKey, PublicKey recipientPubKey) throws Exception {
        // Initialize the RSA cipher for encryption
        Cipher cipher = Cipher.getInstance("RSA");
        cipher.init(Cipher.ENCRYPT_MODE, recipientPubKey);
        
        // Encrypt the key and convert the resulting bytes to a Base64 string
        byte[] encryptedBytes = cipher.doFinal(messageKey.getBytes());
        return Base64.getEncoder().encodeToString(encryptedBytes);
    }

    /**
     * Decrypts an encrypted 'message-key' using your own Private Key.
     * Ensures only the intended recipient can read the key.
     */
    public String decryptMessageKey(String encryptedKeyBase64) throws Exception {
        // Initialize the RSA cipher for decryption
        Cipher cipher = Cipher.getInstance("RSA");
        cipher.init(Cipher.DECRYPT_MODE, this.privateKey);
        
        // Decode the Base64 string and decrypt the bytes
        byte[] decryptedBytes = cipher.doFinal(Base64.getDecoder().decode(encryptedKeyBase64));
        return new String(decryptedBytes);
    }

    /**
     * Encrypts the actual message payload using AES.
     * Fulfills the requirement for 'Both message-key and message encrypted'.
     */
    public String encryptPayload(String plainText, SecretKey aesKey, IvParameterSpec iv) throws Exception {
        // Use AES with CBC mode and PKCS5 padding for standard security
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, aesKey, iv);
        
        byte[] encryptedBytes = cipher.doFinal(plainText.getBytes());
        return Base64.getEncoder().encodeToString(encryptedBytes);
    }

    /**
     * Decrypts the message payload using the AES SecretKey and IV provided.
     */
    public String decryptMessagePayload(String encryptedData, SecretKey aesKey, String ivBase64) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        
        // Decode the IV and create the required parameter spec
        byte[] ivBytes = Base64.getDecoder().decode(ivBase64);
        IvParameterSpec ivSpec = new IvParameterSpec(ivBytes);
        
        cipher.init(Cipher.DECRYPT_MODE, aesKey, ivSpec);
        
        byte[] decryptedBytes = cipher.doFinal(Base64.getDecoder().decode(encryptedData));
        return new String(decryptedBytes);
    }

    /**
     * Converts a decrypted message-key (String) into a SecretKey object for AES operations.
     */
    public SecretKey deriveAESKey(String messageKey) {
        byte[] keyBytes = messageKey.getBytes();
        // AES keys must be 16, 24, or 32 bytes
        byte[] finalKey = new byte[16];
        System.arraycopy(keyBytes, 0, finalKey, 0, Math.min(keyBytes.length, 16));
        return new SecretKeySpec(finalKey, "AES");
    }

    public PublicKey getPublicKey() {
        return this.publicKey;
    }
}
package security;

import java.io.Serializable;

/**
 * A container for data being sent over the network.
 * It holds the RSA-encrypted message-key and the AES-encrypted payload.
 */
public class EncryptedMessage implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * The randomly generated 'message-key' encrypted with the recipient's RSA Public Key.
     */
    public String encryptedKey; 
    
    /**
     * The actual request encrypted using AES.
     */
    public String encryptedData; 

    /**
     * The Initialization Vector used during AES encryption.
     */
    public String iv;

    public EncryptedMessage(String encryptedKey, String encryptedData, String iv) {
        this.encryptedKey = encryptedKey;
        this.encryptedData = encryptedData;
        this.iv = iv;
    }
}
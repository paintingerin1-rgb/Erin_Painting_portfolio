package shared;

import java.io.Serializable; //converts object to be sent over network
import java.util.ArrayList;


/**
 * message object for Client-Server communication.
 */
public class Message implements Serializable { //allows class to be flattened and sent through socket
    private static final long serialVersionUID = 1L; // Ensures compatibility during serialization

    //categories of messages 
    public enum Type {
        CONNECT, DISCONNECT, GLOBAL, WHISPER, USER_LIST, ERROR,
        CALL_REQUEST, CALL_RESPONSE, CALL_TERMINATE, VOICE_NOTE, CHANNEL_JOIN, CHANNEL_LEAVE
    }

    private Type type;
    private String sender; //username of message sender
    private String recipient; //username of message reciever
    private String text; //text of chat message
    private ArrayList<String> onlineUsers;

    // VoIP fields
    private String ipAddress;
    private int udpPort;
    private byte[] audioData;
    private String channelName;


    /**
     * Constructor for normal messages
     */
    public Message(Type type, String sender, String text) {
        this.type = type;
        this.sender = sender;
        this.text = text;
    }

    /**
     * Constructor for user list updates
     */
    public Message(Type type, ArrayList<String> onlineUsers) {
        this.type = type;
        this.onlineUsers = onlineUsers;
    }

    public Message(Type type, String sender, String recipient, String ipAddress, int udpPort) {
        this.type = type;
        this.sender = sender;
        this.recipient = recipient;
        this.ipAddress = ipAddress;
        this.udpPort = udpPort;
    }

    public Message(Type type, String sender, byte[] audioData) {
        this.type = type;
        this.sender = sender;
        this.audioData = audioData;
    }

    // Getters
    public Type getType() { return type; }
    public String getSender() { return sender; }
    public String getRecipient() { return recipient; }
    public String getText() { return text; }
    public ArrayList<String> getOnlineUsers() { return onlineUsers; }
    public String getIpAddress() { return ipAddress; }
    public int getUdpPort() { return udpPort; }
    public byte[] getAudioData() { return audioData; }
    public String getChannelName() { return channelName; }

    // Setters
    public void setRecipient(String recipient) { this.recipient = recipient; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }
    public void setUdpPort(int udpPort) { this.udpPort = udpPort; }
    public void setChannelName(String channelName) { this.channelName = channelName; }
    public void setText(String text) { this.text = text; }
}
package client.ui;

import java.io.*;
import java.net.*;
import javafx.application.Platform;
import shared.Message;
import javax.sound.sampled.*;

import client.audio.AudioConfig;
import client.audio.AudioSender;
import client.audio.AudioReciever;

/**
 * Client class responsible for:
 * - Establishing a connection to the server
 * - Sending and receiving Message objects
 * - Updating the JavaFX UI through the ChatController
 */
public class client {
    private Socket socket;
    private ObjectOutputStream out;
    private ObjectInputStream in;
    private boolean isRunning = false;

    private String myUsername;
    private ChatController controller;

    public enum ClientState {
        IDLE,
        WAITING,
        IN_CALL
    }

    private volatile boolean isRecording = false;
    private ByteArrayOutputStream voiceNoteStream;
    private TargetDataLine microphone;
    private Thread recordingThread;                  // FIX: track thread so we can join it
    private volatile ClientState currentState = ClientState.IDLE;

    private AudioSender audioSender;
    private AudioReciever audioReciever;

    // Each side listens on a different port so they don't collide
    private final int CALLER_RECV_PORT = 5000 + (int)(Math.random() * 1000);
    private final int CALLEE_RECV_PORT = 6000 + (int)(Math.random() * 1000);

    public void setController(ChatController controller) {
        this.controller = controller;
    }

    // ── Connection ────────────────────────────────────────────────────────────

    public boolean connect(String host, int port, String username) {
        try {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port));

            out = new ObjectOutputStream(socket.getOutputStream());
            in  = new ObjectInputStream(socket.getInputStream());

            this.myUsername = username;

            Message loginMsg = new Message(Message.Type.CONNECT, username, "Joining the chat...");
            out.writeObject(loginMsg);
            out.flush();

            Message response = (Message) in.readObject();

            if (response.getType() == Message.Type.ERROR) {
                in.close();
                out.close();
                socket.close();
                return false;
            }

            isRunning = true;
            new Thread(this::listenToServer).start();
            handleIncomingData(response);
            return true;

        } catch (IOException | ClassNotFoundException e) {
            System.err.println("Error connecting to server: " + e.getMessage());
            isRunning = false;
            return false;
        }
    }

    private void listenToServer() {
        try {
            while (isRunning) {
                Object data = in.readObject();
                if (data instanceof Message) {
                    handleIncomingData((Message) data);
                }
            }
        } catch (IOException | ClassNotFoundException e) {
            if (isRunning) {
                isRunning = false;
                System.err.println("Server connection lost: " + e.getMessage());
                if (controller != null)
                    Platform.runLater(() -> controller.onServerDisconnected());
                }
        }
    }

    // ── Message routing ───────────────────────────────────────────────────────

    private void handleIncomingData(Message msg) {
        if (controller == null) {
            new Thread(() -> {
                while (controller == null) {
                    try { Thread.sleep(10); } catch (Exception ignored) {}
                }
                handleIncomingData(msg);
            }).start();
            return;
        }

        Message.Type type = msg.getType();

        switch (type) {
            case GLOBAL -> {
                if (!msg.getSender().equals(myUsername)) {
                    Platform.runLater(() -> controller.appendToGlobal(
                        msg.getSender() + ": " + msg.getText()
                    ));
                }
            }
            case USER_LIST   -> Platform.runLater(() -> controller.updateUserList(msg.getOnlineUsers()));
            case WHISPER     -> Platform.runLater(() -> controller.receiveWhisper(msg.getSender(), msg.getText()));
            case CONNECT     -> Platform.runLater(() -> controller.appendToGlobal("*** " + msg.getSender() + " has joined ***"));
            case DISCONNECT  -> Platform.runLater(() -> controller.appendToGlobal("*** " + msg.getSender() + " has left ***"));
            case ERROR       -> Platform.runLater(() -> controller.showError(msg.getText()));
            case CALL_REQUEST   -> handleIncomingCall(msg);
            case CALL_RESPONSE  -> handleCallResponse(msg);
            case CALL_TERMINATE -> handleCallTerminate(msg);
            case VOICE_NOTE  -> Platform.runLater(() ->
                controller.receiveVoiceNote(msg.getSender(), msg.getAudioData()));
            default -> System.out.println("Unhandled message type: " + type);
        }
    }

    // ── Voice notes ───────────────────────────────────────────────────────────

    public void startRecordingVoiceNote() {
        if (isRecording) return;
        isRecording = true;
        voiceNoteStream = new ByteArrayOutputStream();

        // FIX: save the thread reference so stopAndSendVoiceNote() can join() it
        recordingThread = new Thread(() -> {
            try {
                AudioFormat format = AudioConfig.getFormat();
                microphone = (TargetDataLine) AudioSystem.getLine(
                    new DataLine.Info(TargetDataLine.class, format));
                microphone.open(format);
                microphone.start();

                Platform.runLater(() -> controller.appendToGlobal("🔴 Recording voice note..."));
                byte[] buffer = new byte[1024];
                while (isRecording) {
                    int count = microphone.read(buffer, 0, buffer.length);
                    if (count > 0) voiceNoteStream.write(buffer, 0, count);
                }
                microphone.stop();
                microphone.close();
            } catch (Exception e) {
                isRecording = false;
                System.err.println("Voice note recording error: " + e.getMessage());
            }
        });
        recordingThread.setDaemon(true);
        recordingThread.start();
    }

    public void playVoiceNote(byte[] audioData) {
        new Thread(() -> {
            try {
                // FIX: use AudioConfig.getFormat() — must match recording format
                AudioFormat format = AudioConfig.getFormat();
                SourceDataLine speakers = (SourceDataLine) AudioSystem.getLine(
                    new DataLine.Info(SourceDataLine.class, format));
                speakers.open(format);
                speakers.start();
                speakers.write(audioData, 0, audioData.length);
                speakers.drain();
                speakers.stop();
                speakers.close();
            } catch (Exception e) {
                System.err.println("Voice note playback error: " + e.getMessage());
            }
        }).start();
    }

    public void stopAndSendVoiceNote(String targetUser) {
        if (!isRecording) return;
        isRecording = false;

        if (recordingThread != null) {
            try { recordingThread.join(2000); } catch (InterruptedException ignored) {}
            recordingThread = null;
        }

        byte[] audio = voiceNoteStream.toByteArray();
        if (audio.length == 0) {
            Platform.runLater(() -> controller.showError("Voice note was empty — nothing sent."));
            return;
        }

        Message msg = new Message(Message.Type.VOICE_NOTE, myUsername, audio);
        msg.setRecipient(targetUser);
        sendMessage(msg);
        Platform.runLater(() -> controller.appendToGlobal("🎙️ Voice note sent to " + targetUser));
    }

    // ── Calls ─────────────────────────────────────────────────────────────────

    public void forceIdle() {
        currentState = ClientState.IDLE;
        stopAudio();
    }

    public void startCall(String targetUser) {
        if (currentState == ClientState.IN_CALL) {
            Platform.runLater(() -> controller.showError(
                "Cannot call " + targetUser + ": already in a call or waiting."));
            return;
        }
        currentState = ClientState.WAITING;
        Message req = new Message(Message.Type.CALL_REQUEST, myUsername, targetUser,
                                  getLocalIpAddress(), CALLER_RECV_PORT);
        sendMessage(req);
    }

    private void handleIncomingCall(Message request) {
        if (currentState == ClientState.IDLE) {
            Platform.runLater(() -> controller.onIncomingCall(request));
        } else {
            denyCall(request);
        }
    }

    public void acceptCall(Message request) {
        currentState = ClientState.IN_CALL;

        Message response = new Message(Message.Type.CALL_RESPONSE, myUsername,
                                       request.getSender(), getLocalIpAddress(), CALLEE_RECV_PORT);
        response.setText("ACCEPT");
        sendMessage(response);

        audioReciever = new AudioReciever(CALLEE_RECV_PORT);
        audioReciever.start();
        audioSender = new AudioSender(request.getIpAddress(), request.getUdpPort());
        audioSender.start();
    }

    public void denyCall(Message request) {
        Message response = new Message(Message.Type.CALL_RESPONSE, myUsername,
                                       request.getSender(), "", 0);
        response.setText("BUSY");
        sendMessage(response);
    }

    public void endCall(String targetUser) {
        Message msg = new Message(Message.Type.CALL_TERMINATE, myUsername, targetUser, "", 0);
        sendMessage(msg);
        
    }

    public void handleCallResponse(Message response) {
        

        if ("ACCEPT".equals(response.getText())) {
            currentState = ClientState.IN_CALL;
            Platform.runLater(() -> controller.onCallAccepted(response.getSender()));

            if (audioReciever == null) {
                audioReciever = new AudioReciever(CALLER_RECV_PORT);
                audioReciever.start();
            }
            
            if (audioSender == null) {
                audioSender = new AudioSender(response.getIpAddress(), response.getUdpPort());
                audioSender.start();
            } else {
                
                audioSender.addTarget(response.getIpAddress(), response.getUdpPort());
            }

        } else {
           
            Platform.runLater(() -> {
                controller.onCallDeclined(response.getSender());
                controller.appendToGlobal(response.getSender() + " is busy or declined the call.");
            });
        }
    }

    private void handleCallTerminate(Message msg) {
        
        Platform.runLater(() -> controller.onCallTerminated(msg.getSender()));
        
    }

    private void stopAudio() {
        if (audioSender   != null) { audioSender.stopSending();    audioSender   = null; }
        if (audioReciever != null) { audioReciever.stopReceiving(); audioReciever = null; }
    }

    // ── Messaging ─────────────────────────────────────────────────────────────

    public synchronized void sendMessage(Message msg) {
        try {
            if (out != null) {
                out.writeObject(msg);
                out.flush();
                out.reset();
            }
        } catch (IOException e) {
            System.err.println("Failed to send message: " + e.getMessage());
        }
    }

    public void sendChannelMessage(String channelName, String text) {
        Message msg = new Message(Message.Type.GLOBAL, myUsername, text);
        msg.setChannelName(channelName);
        sendMessage(msg);
    }

    public void disconnect() {
        isRunning = false;
        stopAudio();
        try {
            if (out != null) sendMessage(new Message(Message.Type.DISCONNECT, myUsername, "Logging out"));
            if (in     != null) in.close();
            if (out    != null) out.close();
            if (socket != null) socket.close();
        } catch (IOException e) {
            System.err.println("Error during disconnect: " + e.getMessage());
        }
    }

    private String getLocalIpAddress() {
        if (socket != null && socket.isConnected()) {
            return socket.getLocalAddress().getHostAddress();
        }
        try {
            return InetAddress.getLocalHost().getHostAddress();
        } catch (UnknownHostException e) {
            return "127.0.0.1";
        }
    }
}
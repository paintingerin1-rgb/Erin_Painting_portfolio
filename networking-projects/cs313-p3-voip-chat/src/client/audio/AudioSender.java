package client.audio;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.DataLine;
import javax.sound.sampled.TargetDataLine;

/**
 * Thread responsible for capturing microphone input and sending it via UDP packets.
 */
public class AudioSender extends Thread {
    private boolean isRunning = false;
    private String targetIp;
    private int targetPort;
    private TargetDataLine micLine; // microphone line
    private DatagramSocket udpSocket; // UDP socket

    private final boolean ENABLE_BANDWIDTH_MONITOR = false; // toggle for experiment 2

    private static final double PACKET_LOSS_RATE = 0.0; // Used for experiment 1 (0.0 -> works normally)

    private ArrayList<InetSocketAddress> targets = new ArrayList<>();

    public AudioSender(String targetIp, int targetPort) {
        addTarget(targetIp, targetPort);
    }
    public void addTarget(String ip, int port) {
        targets.add(new InetSocketAddress(ip, port));
    }

    @Override
    public void run() {
        isRunning = true;

        try {
            // Initialize DatagramSocket
            udpSocket = new DatagramSocket(); // Binds to any available local port

            // Set up the AudioFormat and TargetDataLine (Microphone)
            AudioFormat format = AudioConfig.getFormat();
            DataLine.Info info = new DataLine.Info(TargetDataLine.class, format);
            
            micLine = (TargetDataLine) AudioSystem.getLine(info);
            micLine.open(format);
            micLine.start();

            System.out.println("Microphone successfully opened and capturing...");

            // Buffer to hold the raw audio bytes
            byte[] captureBuffer = new byte[1024];

            long lastPrintTime = System.currentTimeMillis();
            long bytesSentThisSecond = 0;

            while (isRunning) {
                // Read bytes from the microphone
                int bytesRead = micLine.read(captureBuffer, 0, captureBuffer.length);
            
                if (bytesRead > 0) {
                    // Send the mic data to EVERYONE in the targets list!
                    for (InetSocketAddress target : targets) {
                        DatagramPacket packet = new DatagramPacket(
                            captureBuffer, bytesRead, target.getAddress(), target.getPort()
                        );
                        // --- EXPERIMENT 1: PACKET LOSS SIMULATION ---
                        if (Math.random() >= PACKET_LOSS_RATE) {
                            udpSocket.send(packet);
                        }
                        // ------------------------------------------
                        if (ENABLE_BANDWIDTH_MONITOR) {
                            bytesSentThisSecond += bytesRead;
                        }
                    }
                    if (ENABLE_BANDWIDTH_MONITOR && (System.currentTimeMillis() - lastPrintTime >= 1000)) {
                        System.out.println("Host Upload Speed: " + (bytesSentThisSecond / 1024) + " KB/s");
                        bytesSentThisSecond = 0; // Reset for the next second
                        lastPrintTime = System.currentTimeMillis();
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Error capturing audio: " + e.getMessage());
        } finally {
            // Clean up and close resources when the loop exits
            if (micLine != null) {
                micLine.stop();
                micLine.close();
                System.out.println("Microphone closed.");
            }
            if (udpSocket != null && !udpSocket.isClosed()) {
                udpSocket.close();
                System.out.println("UDP socket closed.");
            }
        }
    }

    public void stopSending() {
        isRunning = false;
    
        if (udpSocket != null && !udpSocket.isClosed()) {
                udpSocket.close();
            }
            
        
        if (micLine != null && micLine.isOpen()) {
            micLine.stop();
            micLine.close();
        }
    }
}

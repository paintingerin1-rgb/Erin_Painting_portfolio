# ==============================================================================
# Makefile — PeerShare P2P File Sharing | CS313 2026 | Group 17
#
#   make client          Compile client (UI + P2PTransferEngine + security)
#   make server          Compile server (+ security)
#   make run-client      Compile then open the GUI
#   make run-server      Compile then start the server  [PORT=5000]
#   make all             Compile both
#   make clean           Delete compiled output
# ==============================================================================

# ── Toolchain ──────────────────────────────────────────────────────────────────
JAVAC := javac
JAVA  := java

# ── JavaFX — installed via: sudo apt install openjfx ──────────────────────────
# macOS / manual SDK: change FX_PATH to your SDK's lib/ folder
FX_PATH := /usr/share/openjfx/lib
FX_MODS := javafx.controls,javafx.fxml

# ── Directories ────────────────────────────────────────────────────────────────
SRC        := src
OUT_CLIENT := out/client
OUT_SERVER := out/server

# ── Source lists ───────────────────────────────────────────────────────────────
CLIENT_SRC := $(shell find $(SRC)/client $(SRC)/security $(SRC)/shared -name "*.java" 2>/dev/null)
SERVER_SRC := $(shell find $(SRC)/server $(SRC)/security $(SRC)/shared -name "*.java" 2>/dev/null)
FXML_FILES := $(shell find $(SRC)/client/ui \( -name "*.fxml" -o -name "*.css" \) 2>/dev/null)

# ── Entry points ───────────────────────────────────────────────────────────────
CLIENT_MAIN := client.ui.App
SERVER_MAIN := server.Server

# ── Port (override: make run-server PORT=6000) ─────────────────────────────────
PORT := 5000

# ==============================================================================
.PHONY: all client server run-client run-server clean check-fx

all: client server

# ── Client ─────────────────────────────────────────────────────────────────────
client: check-fx
	@echo "[client] Compiling..."
	@mkdir -p $(OUT_CLIENT)
	$(JAVAC) --module-path $(FX_PATH) --add-modules $(FX_MODS) \
	         -d $(OUT_CLIENT) $(CLIENT_SRC)
	@for f in $(FXML_FILES); do \
	    dest=$(OUT_CLIENT)/$$(echo $$f | sed 's|^$(SRC)/||'); \
	    mkdir -p $$(dirname $$dest); \
	    cp $$f $$dest; \
	done
	@echo "[client] Build successful."

# ── Server ─────────────────────────────────────────────────────────────────────
server:
	@echo "[server] Compiling..."
	@mkdir -p $(OUT_SERVER)
	$(JAVAC) -d $(OUT_SERVER) $(SERVER_SRC)
	@echo "[server] Build successful."

# ── Run client (UI test mode — no server required) ─────────────────────────────
run-client: client
	@echo "[client] Launching GUI..."
	$(JAVA) --module-path $(FX_PATH) --add-modules $(FX_MODS) \
	        -cp $(OUT_CLIENT) $(CLIENT_MAIN)

# ── Run server ─────────────────────────────────────────────────────────────────
run-server: server
	@echo "[server] Starting on port $(PORT)..."
	$(JAVA) -cp $(OUT_SERVER) $(SERVER_MAIN) $(PORT)

# ── Check JavaFX is installed ──────────────────────────────────────────────────
check-fx:
	@if [ ! -f "$(FX_PATH)/javafx.controls.jar" ]; then \
	    echo "ERROR: JavaFX not found at $(FX_PATH)"; \
	    echo "  Ubuntu/Debian: sudo apt install openjfx"; \
	    echo "  macOS:         brew install openjfx"; \
	    echo "  Manual:        https://openjfx.io  then update FX_PATH above"; \
	    exit 1; \
	fi

# ── Clean ──────────────────────────────────────────────────────────────────────
clean:
	@rm -rf out/
	@echo "[clean] Done."
# ==============================================================================
# Makefile — Group 17 VoIP Chat (CS313 Project 3)
#
#   make              Compile everything
#   make server       Open the server dashboard      [PORT=5000]
#   make client       Open a client                  [HOST=127.0.0.1 PORT=5000]
#   make clean        Delete compiled output
#
# JavaFX location (override if yours lives elsewhere):
#   make JAVAFX_PATH=/path/to/javafx-sdk/lib
# ==============================================================================

JAVAFX_PATH ?= /usr/share/openjfx/lib

SRC_DIR = src
OUT_DIR = out

MODULES     = javafx.controls,javafx.fxml
MODULE_PATH = --module-path "$(JAVAFX_PATH)"
ADD_MODULES = --add-modules $(MODULES)

JAVAC = javac
JAVA  = java

PORT ?= 5000
HOST ?= 127.0.0.1

.PHONY: all compile server client clean

all: compile

compile:
	@echo "Compiling..."
	@mkdir -p $(OUT_DIR)
	$(JAVAC) $(MODULE_PATH) $(ADD_MODULES) -d $(OUT_DIR) $$(find $(SRC_DIR) -name "*.java")
	@echo "Copying resources (FXML, CSS)..."
	@cd $(SRC_DIR) && find . -type f \( -name "*.fxml" -o -name "*.css" \) \
	      -exec cp --parents {} ../$(OUT_DIR)/ \;
	@echo "Done."

server: compile
	$(JAVA) $(MODULE_PATH) $(ADD_MODULES) -cp $(OUT_DIR) server.serverUI.ServerApp $(PORT)

client: compile
	$(JAVA) $(MODULE_PATH) $(ADD_MODULES) -cp $(OUT_DIR) client.ui.ChatApp $(HOST) $(PORT)

clean:
	@rm -rf $(OUT_DIR)
	@echo "Cleaned."

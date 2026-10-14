# ==============================================================================
# Makefile — Group 17 Chat (CS313 Project 1)
#
#   make compile      Compile everything and copy FXML/CSS resources
#   make run-server   Start the server            [PORT=5000]
#   make run-client   Start a client              [HOST=localhost PORT=5000]
#   make clean        Delete compiled output
#
# JavaFX location (override if yours lives elsewhere):
#   make compile JAVAFX_PATH=/path/to/javafx-sdk/lib
# ==============================================================================

SRC_DIR     = src
OUT_DIR     = out
JAVAFX_PATH ?= /usr/share/openjfx/lib
FX_MODS     = javafx.controls,javafx.fxml

PORT ?= 5000
HOST ?= localhost

.PHONY: compile run-server run-client clean

compile:
	@mkdir -p $(OUT_DIR)
	javac --module-path $(JAVAFX_PATH) --add-modules $(FX_MODS) \
	      -d $(OUT_DIR) $$(find $(SRC_DIR) -name "*.java")
	@# copy every non-Java resource (FXML, CSS) next to the compiled classes
	@cd $(SRC_DIR) && find . -type f \( -name "*.fxml" -o -name "*.css" \) \
	      -exec cp --parents {} ../$(OUT_DIR)/ \;
	@echo "Build complete."

run-server: compile
	java -cp $(OUT_DIR) server.Server $(PORT)

run-client: compile
	java --module-path $(JAVAFX_PATH) --add-modules $(FX_MODS) \
	     -cp $(OUT_DIR) client.ChatApp $(HOST) $(PORT)

clean:
	@rm -rf $(OUT_DIR)
	@echo "Cleaned."

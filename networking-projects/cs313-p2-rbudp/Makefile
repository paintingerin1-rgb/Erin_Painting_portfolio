# ==============================================================================
# Makefile — RBUDP (Reliable Blast UDP) | CS313 Project 2 | Group 17
#
#   make              Compile everything
#   make run          Open the sender and receiver windows
#   make sender       Open the sender window only
#   make receiver     Open the receiver window only
#   make clean        Delete compiled output
#
# JavaFX location (override if yours lives elsewhere):
#   make run JAVAFX_PATH=/path/to/javafx-sdk/lib
#
# The experiment runners are plain console programs; see the README.
# ==============================================================================

JAVAFX_PATH ?= /usr/share/openjfx/lib

# ── Directories ───────────────────────────────────────────────────────────────
SRC_DIR = src
OUT_DIR = out
MAIN    = ui.MainApp

# ── JavaFX module config ──────────────────────────────────────────────────────
MODULES     = javafx.controls,javafx.fxml
MODULE_PATH = --module-path "$(JAVAFX_PATH)"
ADD_MODULES = --add-modules $(MODULES)

JAVAC = javac
JAVA  = java

.PHONY: all compile run sender receiver clean

all: compile

# Compile all .java files in src/ into out/, then copy the stylesheet across
compile:
	@echo "Compiling..."
	@mkdir -p $(OUT_DIR)
	$(JAVAC) $(MODULE_PATH) $(ADD_MODULES) -d $(OUT_DIR) $$(find $(SRC_DIR) -name "*.java")
	@cd $(SRC_DIR) && find . -type f \( -name "*.fxml" -o -name "*.css" \) \
	      -exec cp --parents {} ../$(OUT_DIR)/ \;
	@echo "Done. Run 'make run' to start."

# Both windows side by side
run: compile
	$(JAVA) $(MODULE_PATH) $(ADD_MODULES) -cp $(OUT_DIR) $(MAIN)

# Sender window only
sender: compile
	$(JAVA) $(MODULE_PATH) $(ADD_MODULES) -cp $(OUT_DIR) $(MAIN) sender

# Receiver window only
receiver: compile
	$(JAVA) $(MODULE_PATH) $(ADD_MODULES) -cp $(OUT_DIR) $(MAIN) receiver

# Delete compiled output
clean:
	@echo "Cleaning..."
	@rm -rf $(OUT_DIR)
	@echo "Cleaned."

<script setup lang="ts">
import { ref, computed } from "vue";
import { Upload, X, GripVertical } from "lucide-vue-next";

interface FileItem {
  id: string;
  file: File;
  name: string;
}

defineProps<{
  accept?: string;
  multiple?: boolean;
  label: string;
  lang: "en" | "ru";
}>();

const emit = defineEmits<{
  (e: "update:files", files: File[]): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const files = ref<FileItem[]>([]);
const isDragging = ref(false);
const draggedIndex = ref<number | null>(null);

const isEmpty = computed(() => files.value.length === 0);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function onFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  addFiles(Array.from(input.files));
  input.value = "";
}

function addFiles(newFiles: File[]) {
  const items: FileItem[] = newFiles.map((file) => ({
    id: generateId(),
    file,
    name: file.name
  }));
  files.value.push(...items);
  emitFiles();
}

function removeFile(id: string) {
  files.value = files.value.filter((item) => item.id !== id);
  emitFiles();
}

function updateFileName(id: string, newName: string) {
  const item = files.value.find((f) => f.id === id);
  if (item) {
    item.name = newName;
    emitFiles();
  }
}

function emitFiles() {
  emit("update:files", files.value.map((item) => {
    const renamedFile = new File([item.file], item.name, { type: item.file.type });
    return renamedFile;
  }));
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  event.preventDefault();
  if (!event.dataTransfer?.files) return;
  addFiles(Array.from(event.dataTransfer.files));
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function onDragStart(index: number) {
  draggedIndex.value = index;
}

function onDragEnd() {
  draggedIndex.value = null;
}

function onDragOverItem(event: DragEvent, index: number) {
  event.preventDefault();
  if (draggedIndex.value === null || draggedIndex.value === index) return;
  
  const items = [...files.value];
  const draggedItem = items[draggedIndex.value];
  items.splice(draggedIndex.value, 1);
  items.splice(index, 0, draggedItem);
  
  files.value = items;
  draggedIndex.value = index;
  emitFiles();
}
</script>

<template>
  <div class="file-upload">
    <div
      :class="['file-upload-dropzone', { 'is-dragging': isDragging, 'is-empty': isEmpty }]"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <input
        ref="fileInput"
        type="file"
        :accept="accept"
        :multiple="multiple"
        class="file-upload-input"
        @change="onFileInputChange"
      />
      
      <button
        type="button"
        class="file-upload-btn"
        @click="fileInput?.click()"
      >
        <Upload class="file-upload-icon" aria-hidden="true" />
        <span>{{ label }}</span>
      </button>

      <p class="file-upload-hint">
        {{ lang === "ru" ? "или перетащите файлы сюда" : "or drag and drop files here" }}
      </p>
    </div>

    <ul v-if="!isEmpty" class="file-upload-list">
      <li
        v-for="(item, index) in files"
        :key="item.id"
        :class="['file-upload-item', { 'is-dragging': draggedIndex === index }]"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragend="onDragEnd"
        @dragover="onDragOverItem($event, index)"
      >
        <button
          type="button"
          class="file-upload-drag-handle"
          :aria-label="lang === 'ru' ? 'Переместить' : 'Drag to reorder'"
        >
          <GripVertical class="file-upload-icon-small" aria-hidden="true" />
        </button>

        <input
          :value="item.name"
          class="file-upload-item-input"
          @input="updateFileName(item.id, ($event.target as HTMLInputElement).value)"
        />

        <button
          type="button"
          class="file-upload-remove-btn"
          :aria-label="lang === 'ru' ? 'Удалить' : 'Remove'"
          @click="removeFile(item.id)"
        >
          <X class="file-upload-icon-small" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.file-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-upload-dropzone {
  align-items: center;
  background: var(--ui-surface);
  border: 2px dashed var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  min-height: 120px;
  padding: 20px;
  transition: border-color var(--transition-speed), background-color var(--transition-speed);
}

.file-upload-dropzone.is-dragging {
  background: var(--ui-surface-2);
  border-color: var(--accent-hot);
}

.file-upload-input {
  display: none;
}

.file-upload-btn {
  align-items: center;
  background: var(--ui-surface-2);
  border: 1px solid var(--ui-border-strong);
  color: var(--text-color);
  cursor: var(--cursor-link-select);
  display: inline-flex;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 600;
  gap: 8px;
  letter-spacing: 0.02em;
  padding: 10px 16px;
  transition: background-color var(--transition-speed), border-color var(--transition-speed);
}

.file-upload-btn:hover {
  background: var(--ui-surface);
  border-color: var(--accent-hot);
}

.file-upload-btn:focus-visible {
  border-color: var(--accent-hot);
  box-shadow: 0 0 0 2px rgba(0, 255, 106, 0.2);
  outline: none;
}

.file-upload-icon {
  display: block;
  height: 18px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  width: 18px;
}

.file-upload-hint {
  color: var(--muted-color);
  font-size: 0.85rem;
  margin: 0;
}

.file-upload-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-upload-item {
  align-items: center;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  cursor: move;
  display: grid;
  gap: 8px;
  grid-template-columns: auto 1fr auto;
  padding: 8px 10px;
  transition: background-color var(--transition-speed), border-color var(--transition-speed);
}

.file-upload-item:hover {
  background: var(--ui-surface-2);
  border-color: var(--ui-border-strong);
}

.file-upload-item.is-dragging {
  opacity: 0.5;
}

.file-upload-drag-handle {
  align-items: center;
  background: transparent;
  border: none;
  color: var(--muted-color);
  cursor: move;
  display: flex;
  padding: 0;
}

.file-upload-item-input {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-color);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  padding: 4px 6px;
  transition: border-color var(--transition-speed), background-color var(--transition-speed);
  width: 100%;
}

.file-upload-item-input:hover {
  background: var(--ui-surface-2);
  border-color: var(--ui-border);
}

.file-upload-item-input:focus {
  background: var(--ui-surface-2);
  border-color: var(--accent-hot);
  outline: none;
}

.file-upload-remove-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted-color);
  cursor: var(--cursor-link-select);
  display: flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  transition: color var(--transition-speed), border-color var(--transition-speed);
  width: 28px;
}

.file-upload-remove-btn:hover {
  border-color: var(--ui-border-strong);
  color: var(--danger-color);
}

.file-upload-remove-btn:focus-visible {
  border-color: var(--accent-hot);
  box-shadow: 0 0 0 2px rgba(0, 255, 106, 0.2);
  outline: none;
}

.file-upload-icon-small {
  display: block;
  height: 16px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  width: 16px;
}
</style>

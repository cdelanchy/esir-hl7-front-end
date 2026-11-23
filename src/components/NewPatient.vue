<template>
  <div class="patients">
    <h1>Uploader un message HL7</h1>
    <div class="form">
      <div>
        <label for="file">Choisir un fichier HL7 :</label>
        <input id="file" type="file" ref="fileInput" @change="processFile" />
      </div>
      <div>
        <button class="app_post_btn" @click="addPatient">Valider le message</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { transformHl7ToFhir } from '@/services/hl7Transformer'

const file = ref(null)
const fileInput = ref(null)
const router = useRouter()

const processFile = () => {
  file.value = fileInput.value.files[0]
}

const addPatient = async () => {
  if (!file.value) {
    alert('Choisissez un fichier HL7.')
    return
  }

  const text = await file.value.text()
  try {
    const result = transformHl7ToFhir(text)
    alert(result.operationOutcome.issue[0].details.text)
    router.push({ name: 'Patients' })
  } catch (error) {
    alert(error.message || 'Le fichier HL7 est invalide.')
  }
}
</script>

<style scoped>
.patients {
  max-width: 700px;
  margin: 60px auto;
  background: white;
  border-radius: 14px;
  padding: 30px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
}

.form input,
.form textarea {
  width: 100%;
  max-width: 500px;
  padding: 12px;
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  outline: none;
  font-size: 14px;
}

.form div {
  margin: 20px 0;
}

.app_post_btn {
  background: #4d7ef7;
  color: #fff;
  padding: 12px 30px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
}
</style>

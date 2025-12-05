export class Narrator {

    public voices = $state([] as SpeechSynthesisVoice[]);

    constructor() {

    }

    public init() {
        if (!('speechSynthesis' in window)) {
            console.warn("Speech Synthesis not supported")
            return;
        }

        const updateVoices = () => {
            const synth = window.speechSynthesis;
            const voices = synth.getVoices();
            this.voices = voices;
        }

        window.speechSynthesis.onvoiceschanged = () => {
            updateVoices();
        }

        updateVoices();
    }

    public speak(text: string, voiceName?: string) {
        if (!('speechSynthesis' in window)) {
            console.warn("Speech Synthesis not supported")
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        if (voiceName) {
            const voice = this.voices.find(v => v.name === voiceName);
            if (voice) {
                utterance.voice = voice;
            }
        } else {
            const i = Math.floor(Math.random() * this.voices.length)
            const voice = this.voices[i];
            if (voice) {
                utterance.voice = voice;
            }
        }

        window.speechSynthesis.speak(utterance);
    }
}

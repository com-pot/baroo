export class Narrator {

    public voices = $state([] as SpeechSynthesisVoice[]);
    private filter: {
        exclude: {
            langs: Set<string>;
            voices: Set<string>;
        },
    }

    constructor(opts?: NarratorOptions) {
        this.filter = {
            exclude: {
                langs: new Set(opts?.exclude?.langs || []),
                voices: new Set(opts?.exclude?.voices || []),
            },
        }
    }

    public init() {
        if (!('speechSynthesis' in window)) {
            console.warn("Speech Synthesis not supported")
            return;
        }

        const updateVoices = () => {
            const synth = window.speechSynthesis;
            const voices = synth.getVoices();
            this.voices = voices
                .filter(voice => {
                    if (this.filter.exclude.langs.has(voice.lang)) return false
                    if (this.filter.exclude.voices.has(`${voice.lang}:${voice.name}`)) return false
                    return true
                });
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
        if (!voiceName) {
            const i = Math.floor(Math.random() * this.voices.length)
            voiceName = this.voices[i]?.name;
        }

        const voice = this.voices.find(v => v.name === voiceName);
        if (voice) {
            utterance.voice = voice;
        }

        window.speechSynthesis.speak(utterance);

        return {
            voice,
            utterance,
        }
    }
}

type NarratorOptions = {
    exclude?: {
        langs?: string[];
        voices?: string[];
    }
}

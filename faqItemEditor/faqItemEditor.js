/**
 * faqItemEditor — popup editor for a single FAQ question/answer pair, opened
 * from sectionFaq on item click instead of inline contenteditable. Parent owns
 * open/close state (created/destroyed via lwc:if), same convention as
 * humanRequestModal/imageCropper elsewhere in this codebase.
 */
import { LightningElement, api } from 'lwc';

export default class FaqItemEditor extends LightningElement {
    @api question = '';
    @api answer = '';

    draftQuestion = this.question;
    draftAnswer = this.answer;

    connectedCallback() {
        this.draftQuestion = this.question;
        this.draftAnswer = this.answer;
    }

    handleQuestionInput(event) {
        this.draftQuestion = event.target.value;
    }

    handleAnswerInput(event) {
        this.draftAnswer = event.target.value;
    }

    handleSave() {
        this.dispatchEvent(
            new CustomEvent('save', {
                detail: { q: this.draftQuestion.trim(), a: this.draftAnswer.trim() }
            })
        );
    }

    close() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleBackdrop() {
        this.close();
    }

    stop(event) {
        event.stopPropagation();
    }
}

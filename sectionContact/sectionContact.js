/**
 * sectionContact — the form builder. Edit mode shows an inline builder (add /
 * relabel / retype / require / remove fields, plus per-type options and an
 * optional "show only when" condition on an earlier field); live and preview
 * modes render a working form across text/email/textarea/number/date/select/
 * radio/checkbox fields: client-side validation, a honeypot that silently
 * swallows bot submissions, a submitting state, and a thank-you state whose
 * message is editable content. Real submissions are stored as
 * Website_Form_Submission__c via WebsuiteFormController with the answers as
 * JSON keyed by field label; an optional notify email (settingsPanel) fires a
 * best-effort email on each submission.
 */
import { LightningElement, api } from 'lwc';
import submitForm from '@salesforce/apex/WebsuiteFormController.submitForm';
import store from 'c/siteStateService';
import { sectionRootClass, sectionRootStyle, blockStyle, commitField, emitChange, fieldStyle } from 'c/sectionCommon';

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'email', label: 'Email' },
    { value: 'textarea', label: 'Long text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'radio', label: 'Radio buttons' },
    { value: 'checkbox', label: 'Checkboxes' }
];
const INPUT_TYPE_MAP = { email: 'email', number: 'number', date: 'date' };
// Fields a later field's "show only when" condition can point at — excludes
// textarea (long-text equality isn't a useful condition) and checkbox
// (multi-value; "equals" doesn't map cleanly onto a set).
const CONTROLLER_TYPES = ['text', 'email', 'number', 'date', 'select', 'radio'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isChoiceType(type) {
    return type === 'select' || type === 'radio' || type === 'checkbox';
}

// A field with a condition is visible only once its controller field's
// current value matches. Missing/cleared condition = always visible.
function conditionMet(field, values) {
    const cond = field.condition;
    if (!cond || cond.on === undefined || cond.on === null || cond.on === '') {
        return true;
    }
    const raw = values[cond.on];
    const current = Array.isArray(raw) ? '' : raw || '';
    return String(current).trim() === String(cond.equals || '').trim();
}

export default class SectionContact extends LightningElement {
    @api content = {};
    @api sectionStyle = {};
    @api variant = 'form';
    @api layout = {};
    @api mode = 'live';

    // Live-form state, local to this render of the section.
    values = {};
    errors = {};
    submitting = false;
    submitted = false;
    submitError = '';

    get isEdit() {
        return this.mode === 'edit';
    }
    get editableAttr() {
        return this.isEdit ? 'true' : 'false';
    }
    get rootClass() {
        return sectionRootClass('sec_contact', {
            variant: this.variant,
            style: this.sectionStyle,
            layout: this.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle, { imageUrl: this.content?.imageUrl });
    }
    get blockStyle() {
        return blockStyle(this.layout);
    }

    // Per-field typography overrides — independent of the section-wide style
    // shell above. successMessage renders in two places (the edit-mode builder
    // preview and the live thank-you state), so both consume this same getter.
    get headingFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'heading');
    }
    get bodyFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'body');
    }
    get successMessageFieldStyle() {
        return fieldStyle(this.sectionStyle?.fields, 'successMessage');
    }

    get heading() {
        return this.content?.heading || '';
    }
    get body() {
        return this.content?.body || '';
    }
    get successMessage() {
        return this.content?.successMessage || 'Thanks — your message has been sent.';
    }

    get fieldTypes() {
        return FIELD_TYPES;
    }

    get fields() {
        const rawFields = this.content?.fields || [];
        return rawFields.map((f, index) => {
            const type = f.type || 'text';
            const isChoice = isChoiceType(type);
            const options = isChoice ? f.options || [] : [];
            const rawValue = this.values[index];
            const value = type === 'checkbox' ? (Array.isArray(rawValue) ? rawValue : []) : rawValue || '';
            const condition =
                f.condition && f.condition.on !== undefined && f.condition.on !== null && f.condition.on !== ''
                    ? f.condition
                    : null;

            // Earlier fields whose type can meaningfully gate this one.
            const eligible = [];
            rawFields.forEach((cf, ci) => {
                if (ci < index && CONTROLLER_TYPES.includes(cf.type || 'text')) {
                    eligible.push({ field: cf, i: ci });
                }
            });
            const controllerOptions = [
                { value: '', label: '— always show —', selected: !condition },
                ...eligible.map(({ field: cf, i: ci }) => ({
                    value: String(ci),
                    label: `Show when “${cf.label || `Field ${ci + 1}`}”…`,
                    selected: !!condition && Number(condition.on) === ci
                }))
            ];
            const controllerField = condition ? rawFields[condition.on] : null;
            const conditionValueIsChoice = !!controllerField && (controllerField.type === 'select' || controllerField.type === 'radio');
            const conditionValueOptions = conditionValueIsChoice
                ? (controllerField.options || []).map((o) => ({ value: o, label: o, selected: o === (condition.equals || '') }))
                : [];

            return {
                ...f,
                index,
                key: `f${index}`,
                type,
                isTextarea: type === 'textarea',
                isSelect: type === 'select',
                isRadio: type === 'radio',
                isCheckbox: type === 'checkbox',
                isChoice,
                inputType: INPUT_TYPE_MAP[type] || 'text',
                value,
                options: options.map((o) => ({ value: o, selected: type === 'checkbox' ? value.includes(o) : value === o })),
                optionsText: options.join('\n'),
                radioName: `f${index}`,
                error: this.errors[index] || '',
                rowClass: this.errors[index] ? 'form__row form__row_error' : 'form__row',
                typeOptions: FIELD_TYPES.map((t) => ({ ...t, selected: t.value === type })),
                hasEligibleControllers: eligible.length > 0,
                controllerOptions,
                conditionActive: !!condition,
                conditionEquals: condition ? condition.equals || '' : '',
                conditionValueIsChoice,
                conditionValueOptions,
                visible: condition ? conditionMet(f, this.values) : true
            };
        });
    }

    get showForm() {
        return !this.submitted;
    }

    get submitLabel() {
        return this.submitting ? 'Sending…' : 'Send message';
    }

    // ---- shared inline edits ------------------------------------------------
    handleKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }
    handleEdit(event) {
        commitField(this, event, this.content);
    }

    // ---- builder (edit mode) ------------------------------------------------
    _patchFields(mutator) {
        const next = (this.content?.fields || []).map((f) => ({ ...f }));
        emitChange(this, { fields: mutator(next) || next });
    }

    handleFieldLabel(event) {
        const i = Number(event.currentTarget.dataset.index);
        const value = event.target.value;
        this._patchFields((list) => {
            if (list[i]) {
                list[i].label = value;
            }
        });
    }

    handleFieldType(event) {
        const i = Number(event.currentTarget.dataset.index);
        const value = event.target.value;
        this._patchFields((list) => {
            if (!list[i]) {
                return;
            }
            list[i].type = value;
            if (isChoiceType(value) && !(list[i].options && list[i].options.length)) {
                list[i].options = ['Option 1', 'Option 2'];
            }
            if (!CONTROLLER_TYPES.includes(value)) {
                // No longer a valid controller — drop any condition pointing at it.
                list.forEach((other) => {
                    if (other.condition && Number(other.condition.on) === i) {
                        other.condition = null;
                    }
                });
            }
        });
    }

    handleFieldOptions(event) {
        const i = Number(event.currentTarget.dataset.index);
        const lines = event.target.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        this._patchFields((list) => {
            if (list[i]) {
                list[i].options = lines;
            }
        });
    }

    handleFieldConditionOn(event) {
        const i = Number(event.currentTarget.dataset.index);
        const raw = event.target.value;
        this._patchFields((list) => {
            if (!list[i]) {
                return;
            }
            list[i].condition = raw === '' ? null : { on: Number(raw), equals: (list[i].condition && list[i].condition.equals) || '' };
        });
    }

    handleFieldConditionValue(event) {
        const i = Number(event.currentTarget.dataset.index);
        const value = event.target.value;
        this._patchFields((list) => {
            if (list[i] && list[i].condition) {
                list[i].condition = { ...list[i].condition, equals: value };
            }
        });
    }

    handleFieldRequired(event) {
        const i = Number(event.currentTarget.dataset.index);
        const value = event.target.checked;
        this._patchFields((list) => {
            if (list[i]) {
                list[i].required = value;
            }
        });
    }

    handleFieldRemove(event) {
        const i = Number(event.currentTarget.dataset.index);
        this._patchFields((list) =>
            list
                .filter((_, idx) => idx !== i)
                .map((f) => {
                    if (!f.condition) {
                        return f;
                    }
                    const on = Number(f.condition.on);
                    if (on === i) {
                        return { ...f, condition: null };
                    }
                    if (on > i) {
                        return { ...f, condition: { ...f.condition, on: on - 1 } };
                    }
                    return f;
                })
        );
    }

    handleFieldAdd() {
        this._patchFields((list) => {
            list.push({ label: 'New field', type: 'text', required: false });
        });
    }

    // ---- live form ----------------------------------------------------------
    handleInput(event) {
        const i = Number(event.currentTarget.dataset.index);
        this.values = { ...this.values, [i]: event.target.value };
        if (this.errors[i]) {
            const errors = { ...this.errors };
            delete errors[i];
            this.errors = errors;
        }
    }

    handleCheckboxChange(event) {
        const i = Number(event.currentTarget.dataset.index);
        const option = event.currentTarget.dataset.option;
        const checked = event.target.checked;
        const current = Array.isArray(this.values[i]) ? this.values[i] : [];
        const next = checked ? [...current, option] : current.filter((o) => o !== option);
        this.values = { ...this.values, [i]: next };
        if (this.errors[i]) {
            const errors = { ...this.errors };
            delete errors[i];
            this.errors = errors;
        }
    }

    handleSubmit(event) {
        event.preventDefault();
        if (this.isEdit || this.submitting) {
            return;
        }
        // Honeypot: humans never see the field; anything in it means a bot.
        // Pretend success so the bot has nothing to learn from.
        const trap = this.template.querySelector('.form__trap input');
        if (trap && trap.value) {
            this.submitted = true;
            return;
        }

        const fields = this.content?.fields || [];
        const errors = {};
        const payload = {};
        fields.forEach((f, i) => {
            // Hidden (condition unmet) fields are never validated or submitted.
            if (!conditionMet(f, this.values)) {
                return;
            }
            const type = f.type || 'text';
            if (type === 'checkbox') {
                const validOptions = f.options || [];
                const selected = (Array.isArray(this.values[i]) ? this.values[i] : []).filter((o) => validOptions.includes(o));
                if (f.required && !selected.length) {
                    errors[i] = 'Choose at least one option.';
                }
                payload[f.label || `Field ${i + 1}`] = selected;
                return;
            }
            const value = (this.values[i] || '').trim();
            if (f.required && !value) {
                errors[i] = 'This field is required.';
            } else if (type === 'email' && value && !EMAIL_RE.test(value)) {
                errors[i] = 'That doesn’t look like an email address.';
            } else if (type === 'number' && value && Number.isNaN(Number(value))) {
                errors[i] = 'Enter a valid number.';
            } else if ((type === 'select' || type === 'radio') && value && !(f.options || []).includes(value)) {
                errors[i] = 'Choose a valid option.';
            }
            payload[f.label || `Field ${i + 1}`] = value;
        });
        this.errors = errors;
        if (Object.keys(errors).length) {
            return;
        }

        this.submitting = true;
        this.submitError = '';
        submitForm({
            siteId: store.getRecordId(),
            formName: this.heading,
            payloadJson: JSON.stringify(payload),
            notifyEmail: this.content?.notifyEmail || ''
        })
            .then(() => {
                this.submitted = true;
                this.values = {};
            })
            .catch((e) => {
                this.submitError = (e && e.body && e.body.message) || 'Something went wrong — please try again.';
            })
            .finally(() => {
                this.submitting = false;
            });
    }

    handleReset() {
        this.submitted = false;
        this.errors = {};
    }
}